import { CartStatusEnum } from "../constants/model.const";
import { CartModel } from "../models/cart/cart.model";

export async function expireOldCarts(now = new Date()) {
  const result = await CartModel.updateMany(
    {
      status: CartStatusEnum.ACTIVE,
      expiredAt: { $lte: now },
    },
    {
      status: CartStatusEnum.EXPIRED,
    },
  );

  return { expiredCount: result.modifiedCount || 0 };
}
