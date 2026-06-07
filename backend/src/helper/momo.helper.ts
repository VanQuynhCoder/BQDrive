import axios from "axios";
import crypto from "crypto";

type CreateMomoPaymentInput = {
  amount: number;
  orderId: string;
  requestId: string;
  orderInfo: string;
  extraData?: string;
};

export async function createMomoPayment({
  amount,
  orderId,
  requestId,
  orderInfo,
  extraData = "",
}: CreateMomoPaymentInput) {
  const partnerCode = process.env.MOMO_PARTNER_CODE || "MOMO";
  const accessKey = process.env.MOMO_ACCESS_KEY || "F8BBA842ECF85";
  const secretKey =
    process.env.MOMO_SECRET_KEY || "K951B6PE1waDMi640xX08PD3vg6EkVlz";

  const endpoint =
    process.env.MOMO_ENDPOINT ||
    "https://test-payment.momo.vn/v2/gateway/api/create";

  const redirectUrl =
    process.env.MOMO_REDIRECT_URL || "http://localhost:5173/payment-result";

  const ipnUrl =
    process.env.MOMO_IPN_URL ||
    "http://localhost:5000/api/payments/momo/ipn";

  const requestType = "captureWallet";

  const rawSignature =
    `accessKey=${accessKey}` +
    `&amount=${amount}` +
    `&extraData=${extraData}` +
    `&ipnUrl=${ipnUrl}` +
    `&orderId=${orderId}` +
    `&orderInfo=${orderInfo}` +
    `&partnerCode=${partnerCode}` +
    `&redirectUrl=${redirectUrl}` +
    `&requestId=${requestId}` +
    `&requestType=${requestType}`;

  const signature = crypto
    .createHmac("sha256", secretKey)
    .update(rawSignature)
    .digest("hex");

  const requestBody = {
    partnerCode,
    accessKey,
    requestId,
    amount: String(amount),
    orderId,
    orderInfo,
    redirectUrl,
    ipnUrl,
    extraData,
    requestType,
    signature,
    lang: "vi",
  };

  const response = await axios.post(endpoint, requestBody, {
    headers: {
      "Content-Type": "application/json",
    },
  });

  return response.data;
}

export function verifyMomoSignature(data: any) {
  const secretKey =
    process.env.MOMO_SECRET_KEY || "K951B6PE1waDMi640xX08PD3vg6EkVlz";

  const rawSignature =
    `accessKey=${data.accessKey}` +
    `&amount=${data.amount}` +
    `&extraData=${data.extraData}` +
    `&message=${data.message}` +
    `&orderId=${data.orderId}` +
    `&orderInfo=${data.orderInfo}` +
    `&orderType=${data.orderType}` +
    `&partnerCode=${data.partnerCode}` +
    `&payType=${data.payType}` +
    `&requestId=${data.requestId}` +
    `&responseTime=${data.responseTime}` +
    `&resultCode=${data.resultCode}` +
    `&transId=${data.transId}`;

  const signature = crypto
    .createHmac("sha256", secretKey)
    .update(rawSignature)
    .digest("hex");

  return signature === data.signature;
}