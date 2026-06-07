import jwt from "jsonwebtoken";

export type JwtPayloadType = {
  userId: string;
  role: string;
};

export class TokenHelper {
  static generateToken(payload: JwtPayloadType) {
    return jwt.sign(payload, process.env.JWT_SECRET as string, {
      expiresIn: "7d",
    });
  }

  static verifyToken(token: string) {
    return jwt.verify(token, process.env.JWT_SECRET as string);
  }
}