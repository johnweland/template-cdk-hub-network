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

In your configuration file, you can define several options to control how your network stack is deployed. For IP addressing, you must choose between using Amazon IPAM or providing a static CIDR block. When using IPAM, specify the pool ID and mask, for example: `ipam: { poolId: ipam-pool-xxxxxxxxxxxxx, mask: 24 }`. If you are not using IPAM, you must define a CIDR such as `cidr: "10.0.0.0/16"`. For availability zone configuration, if your workload requires specific zones—for example, AWS WorkSpaces—you can look up the AZ mapping in the AWS Console (e.g., use1 -> us-east-1a) and provide them directly with `availabilityZones: ["us-east-2a", "us-east-2b"]`. If you do not need specific zones, you can instead specify the number of zones using `maxAzs: 2`, and if neither value is provided, the default of three zones will be used. Finally, you can include tags as key-value pairs to help identify and organize your resources, for example: `tags: { Project: "MyApp", Environment: "Prod", Owner: "John Doe" }`.

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
