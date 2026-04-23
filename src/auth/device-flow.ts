/**
 * Device-flow login (RFC 8628 spirit): kicks off a flow on the server, prints
 * the user_code to the terminal, polls until the user approves at /device.
 *
 * Used when there's no browser-on-localhost handshake available (SSH, CI,
 * Docker exec, restrictive networks).
 */

import pc from "picocolors";
import { ApiClient } from "../api/client.js";
import { FloopError } from "../api/errors.js";

interface StartDeviceResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
}

interface PollResponse {
  token: string;
  tokenPrefix: string;
  tokenId: string;
  user: { id: string; email: string | null; name: string | null };
}

export interface DeviceFlowResult {
  token: string;
  tokenPrefix: string;
  user: { id: string; email: string | null; name: string | null };
}

export async function runDeviceFlow(
  client: ApiClient,
  deviceName: string,
  deviceOs: string,
): Promise<DeviceFlowResult> {
  const started = await client.request<StartDeviceResponse>(
    "POST",
    "/api/cli/start-device",
    { deviceName, deviceOs },
  );

  console.log("");
  console.log(pc.bold("To authorize this device:"));
  console.log(`  1. Open ${pc.cyan(started.verificationUri)}`);
  console.log(`  2. Enter the code:  ${pc.bold(pc.green(started.userCode))}`);
  console.log("");
  console.log(pc.dim(`Or paste this URL with the code embedded:`));
  console.log(pc.dim(`  ${started.verificationUriComplete}`));
  console.log("");
  console.log(pc.dim(`Waiting for approval (expires in ${Math.round(started.expiresIn / 60)} min)...`));

  const expiresAt = Date.now() + started.expiresIn * 1000;
  const intervalMs = Math.max(1, started.interval) * 1000;

  while (Date.now() < expiresAt) {
    await sleep(intervalMs);
    try {
      const polled = await client.request<PollResponse>(
        "POST",
        "/api/cli/poll",
        { deviceCode: started.deviceCode },
      );
      // Success.
      return {
        token: polled.token,
        tokenPrefix: polled.tokenPrefix,
        user: polled.user,
      };
    } catch (err) {
      if (err instanceof FloopError) {
        if (err.code === "AUTHORIZATION_PENDING") continue; // keep polling
        throw err; // ACCESS_DENIED, EXPIRED_TOKEN, etc. — fail through
      }
      throw err;
    }
  }

  throw new FloopError({
    code: "EXPIRED_TOKEN",
    message: "Device code expired before approval",
    status: 0,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
