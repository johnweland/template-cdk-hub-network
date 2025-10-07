import {
  Stack,
  StackProps,
  Tags,
  CfnOutput,
  Duration,
  RemovalPolicy,
} from "aws-cdk-lib";
import {
  CfnTransitGateway,
  CfnTransitGatewayVpcAttachment,
  CfnTransitGatewayRouteTable,
  CfnTransitGatewayRoute,
  CfnTransitGatewayRouteTableAssociation,
  CfnPrefixList,
  FlowLogDestination,
  FlowLogTrafficType,
  IpAddresses,
  SubnetType,
  Vpc,
  Subnet,
  CfnFlowLog,
} from "aws-cdk-lib/aws-ec2";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

/** Network source: IPAM OR CIDR (never both) */
type IpamSource = { ipam: { poolId: string; mask: number }; cidr?: never };
type CidrSource = { cidr: string; ipam?: never };
type NetworkSource = IpamSource | CidrSource;

/** AZ selection: explicit zones OR maxAzs OR neither (default later) */
type AzByList = { availabilityZones: string[]; maxAzs?: never };
type AzByCount = { maxAzs: number; availabilityZones?: never };
type AzNeither = { availabilityZones?: never; maxAzs?: never };
type AzSelection = AzByList | AzByCount | AzNeither;

export type Props = StackProps &
  NetworkSource &
  AzSelection & {
    subnetCidrMask: number;

    /** Optional destination for long-term logs in your Log Archive account */
    logArchiveBucketArn?: string; // e.g. arn:aws:s3:::org-log-archive-123456789012
    logArchivePrefix?: string; // e.g. "network/hub/"

    tags?: {
      project?: string;
      environment?: string;
      owner?: string;
      [key: string]: string | undefined;
    };
  };

export class NetworkHubStack extends Stack {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    const defaultTags = {
      project: "networking",
      environment: "non-prod",
      owner: "enterprise-architecture",
    };
    const mergedTags = { ...defaultTags, ...(props.tags ?? {}) };
    for (const [key, value] of Object.entries(mergedTags)) {
      if (!value) continue;
      if (key.startsWith("aws:")) continue;
      Tags.of(this).add(key, value.trim().toLowerCase());
    }

    // Build IpAddresses from mutually exclusive network source
    const ipAddresses = props.ipam
      ? IpAddresses.awsIpamAllocation({
          ipv4IpamPoolId: props.ipam.poolId,
          ipv4NetmaskLength: props.ipam.mask,
          defaultSubnetIpv4NetmaskLength: props.ipam.mask,
        })
      : IpAddresses.cidr(props.cidr!);

    const vpc = new Vpc(this, "HubVpc", {
      ipAddresses,
      ...(props.availabilityZones
        ? { availabilityZones: props.availabilityZones }
        : { maxAzs: props.maxAzs ?? 3 }),
      subnetConfiguration: [
        {
          name: "central-egress",
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: props.subnetCidrMask,
        },
        {
          name: "central-nat",
          subnetType: SubnetType.PUBLIC,
          cidrMask: props.subnetCidrMask,
        },
      ],
      restrictDefaultSecurityGroup: false,
    });

    vpc
      .selectSubnets({ subnetGroupName: "central-egress" })
      .subnets.forEach((s) => {
        Tags.of(s).add("Name", `central-egress-${s.availabilityZone}`);
        Tags.of(s).add("role", "private-egress");
      });
    vpc
      .selectSubnets({ subnetGroupName: "central-nat" })
      .subnets.forEach((s) => {
        Tags.of(s).add("Name", `central-nat-${s.availabilityZone}`);
        Tags.of(s).add("role", "public");
      });

    // ---- Flow Logs: VPC -> CloudWatch (7 days) ----------------------------
    const vpcLogGroup = new LogGroup(this, "VPCFlowLogsLogGroup", {
      retention: RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY, // change to RETAIN if you prefer
    });

    const vpcFlowLogs = vpc.addFlowLog("VPCFlowLogsCWL", {
      destination: FlowLogDestination.toCloudWatchLogs(vpcLogGroup),
      trafficType: FlowLogTrafficType.ALL,
    });

    // ---- Flow Logs: VPC -> S3 (optional, long-term) -----------------------
    // NOTE: For cross-account S3, you must configure bucket policy in Log Archive account to allow delivery.
    if (props.logArchiveBucketArn) {
      new CfnFlowLog(this, "VPCFlowLogsS3", {
        resourceId: vpc.vpcId,
        resourceType: "VPC",
        trafficType: "ALL",
        logDestinationType: "s3",
        logDestination: props.logArchiveBucketArn, // bucket ARN
        logFormat: undefined, // use default format, or set a custom format string
        maxAggregationInterval: 60,
        destinationOptions: {
          hiveCompatiblePartitions: false,
          perHourPartition: true,
        },
        // S3 prefix is specified via logDestination + "logArchivePrefix" (AWS uses key prefix in bucket settings),
        // but CloudFormation for VPC Flow Logs doesn't take 'LogDestination' prefix separately.
        // We'll include the prefix as part of S3 bucket policy on the destination side.
      });
    }

    // ---- TGW + Route Table -------------------------------------------------
    const tgw = new CfnTransitGateway(this, "TransitGateway", {
      description: "Transit Gateway for Central Inspection Network",
      autoAcceptSharedAttachments: "enable",
      defaultRouteTableAssociation: "disable",
      defaultRouteTablePropagation: "disable",
      dnsSupport: "enable",
      vpnEcmpSupport: "enable",
    });
    Tags.of(tgw).add("Name", "central-inspection-tgw");

    const egressAtt = new CfnTransitGatewayVpcAttachment(
      this,
      "EgressAttachment",
      {
        transitGatewayId: tgw.ref,
        vpcId: vpc.vpcId,
        subnetIds: vpc
          .selectSubnets({ subnetGroupName: "central-egress" })
          .subnets.map((s) => s.subnetId),
        options: { ApplianceModeSupport: "enable", DnsSupport: "enable" },
      },
    );
    Tags.of(egressAtt).add("Name", `tgw-att-egress-${Stack.of(this).region}`);

    const transitRt = new CfnTransitGatewayRouteTable(this, "TransitRt", {
      transitGatewayId: tgw.ref,
    });
    Tags.of(transitRt).add("Name", "tgw-rt-central-egress");

    new CfnTransitGatewayRouteTableAssociation(this, "AssocEgress", {
      transitGatewayAttachmentId: egressAtt.ref,
      transitGatewayRouteTableId: transitRt.ref,
    }).node.addDependency(egressAtt);

    new CfnTransitGatewayRoute(this, "TransitDefaultToEgress", {
      transitGatewayRouteTableId: transitRt.ref,
      destinationCidrBlock: "0.0.0.0/0",
      transitGatewayAttachmentId: egressAtt.ref,
    }).node.addDependency(egressAtt);

    // ---- Outputs ------------------------------------------------------------
    new CfnOutput(this, "VpcId", {
      value: vpc.vpcId,
      description: "Central Egress VPC",
    });
    new CfnOutput(this, "FlowLogsId", {
      value: vpcFlowLogs.flowLogId,
      description: "Central VPC Flow Logs (CWL) ID",
    });
    new CfnOutput(this, "EgressAttachmentId", {
      value: egressAtt.ref,
      description: "TGW Egress Attachment ID",
    });
    new CfnOutput(this, "VpcFlowLogGroupName", {
      value: vpcLogGroup.logGroupName,
      description: "VPC Flow Logs LogGroup",
    });
  }
}
