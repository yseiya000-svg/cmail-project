import { SignJWT, jwtVerify } from "jose";

export type MobileJwtPayload = {
  accessToken: string;
  refreshToken: string;
  email: string;
  name: string;
};

function secret() {
  if (!process.env.NEXTAUTH_SECRET) throw new Error("NEXTAUTH_SECRET is not set");
  return new TextEncoder().encode(process.env.NEXTAUTH_SECRET);
}

export async function createMobileJwt(payload: MobileJwtPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
}

export async function verifyMobileJwt(token: string): Promise<MobileJwtPayload> {
  const { payload } = await jwtVerify(token, secret());
  return payload as unknown as MobileJwtPayload;
}
