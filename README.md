# Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template

## Configuration Options

in your config file you cna specify a few things; if you are using Amazon IPAM you can specify the pool id and mask `ipam: { poolId: ipam-pool-xxxxxxxxxxxxx; mask: 24 }` or you must specify a CIDR `cidr: "10.0.0.0/16"`. If your workload requires specific AZs such as Workspaces you can login to the AWS console and check the AZ mapping e.g [use1 -> us-east-1a], you can pass in `availabilityZones: ["us-east-2a", "us-east-2b"]`. If you do not need specific AZs you can can specify the number of AZs with `maxAzs: 2` if neither is specified we default to `3`. Finally you cna specify any nmber of tags as key:value pairs

config/file-{region}.json
```
{
    ipam: { poolId: ipam-pool-xxxxxxxxxxxxx; mask: 24 },
    availabilityZones: ["us-east-2a", "us-east-2b"],
    tags: {
        "environment": "Prod",
        "cost-center": "12345",
    }
}
```
