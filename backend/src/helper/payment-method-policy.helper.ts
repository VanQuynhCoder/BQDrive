import { ErrorHelper } from "../base/error";
import {
  PaymentMethodEnum,
  PaymentTypeEnum,
} from "../constants/model.const";

const ONLINE_PAYMENT_METHODS = Object.freeze([
  PaymentMethodEnum.MOMO,
  PaymentMethodEnum.VNPAY,
]);

export const PAYMENT_METHODS_BY_TYPE: Readonly<
  Record<PaymentTypeEnum, readonly PaymentMethodEnum[]>
> = Object.freeze({
  [PaymentTypeEnum.DEPOSIT]: ONLINE_PAYMENT_METHODS,
  [PaymentTypeEnum.FULL]: ONLINE_PAYMENT_METHODS,
  [PaymentTypeEnum.REMAINING]: Object.freeze([
    ...ONLINE_PAYMENT_METHODS,
    PaymentMethodEnum.CASH,
  ]),
  [PaymentTypeEnum.EXTENSION]: ONLINE_PAYMENT_METHODS,
  [PaymentTypeEnum.EXTRA_CHARGE]: ONLINE_PAYMENT_METHODS,
});

export function assertPaymentMethodAllowed(
  paymentType: unknown,
  method: unknown,
) {
  if (!Object.values(PaymentTypeEnum).includes(paymentType as PaymentTypeEnum)) {
    throw ErrorHelper.requestDataInvalid("Loại thanh toán không hợp lệ");
  }

  if (!Object.values(PaymentMethodEnum).includes(method as PaymentMethodEnum)) {
    throw ErrorHelper.requestDataInvalid("Phương thức thanh toán không hợp lệ");
  }

  const allowedMethods =
    PAYMENT_METHODS_BY_TYPE[paymentType as PaymentTypeEnum] || [];
  if (allowedMethods.includes(method as PaymentMethodEnum)) return;

  if (paymentType === PaymentTypeEnum.EXTENSION) {
    throw ErrorHelper.requestDataInvalid(
      "Gia hạn và chuyển gói chỉ hỗ trợ thanh toán qua MoMo hoặc VNPay",
    );
  }

  if (paymentType === PaymentTypeEnum.EXTRA_CHARGE) {
    throw ErrorHelper.requestDataInvalid(
      "Khách chỉ có thể thanh toán phụ phí qua MoMo hoặc VNPay; tiền mặt phải do chủ xe xác nhận",
    );
  }

  throw ErrorHelper.requestDataInvalid(
    "Phương thức thanh toán không được hỗ trợ cho loại thanh toán này",
  );
}
