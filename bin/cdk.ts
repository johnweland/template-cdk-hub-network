#!/opt/homebrew/opt/node/bin/node
import "source-map-support/register";
import * as fs from "fs";
import * as path from "path";
import * as cdk from "aws-cdk-lib";
import { NetworkHubStack } from "../lib/network-hub-stack";

const app = new cdk.App();

// Helper: load JSON when -c configFile=./path/to.json is provided
function loadConfigFromPattern<T = any>(pattern: string): T {
  const region =
    process.env.CDK_DEFAULT_REGION ??
    process.env.AWS_REGION ??
    app.node.tryGetContext("region"); // optional fallback if you set it via -c region=...
  const account =
    process.env.CDK_DEFAULT_ACCOUNT ??
    process.env.AWS_ACCOUNT_ID ??
    app.node.tryGetContext("account");

  if (!region) {
    throw new Error(
      "Region not resolved. Pass --region or set CDK_DEFAULT_REGION.",
    );
  }

  const finalPath = pattern
    .replace("{region}", region)
    .replace("{account}", account ?? "unknown");

  const abs = path.isAbsolute(finalPath)
    ? finalPath
    : path.resolve(process.cwd(), finalPath);

  if (!fs.existsSync(abs)) {
    throw new Error(`Config file not found: ${abs}`);
  }

  const raw = fs.readFileSync(abs, "utf-8");
  return JSON.parse(raw) as T;
}

new NetworkHubStack(app, "NetworkHubStack", {
  ...loadConfigFromPattern("./config/hub-network-{region}.json"),
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
