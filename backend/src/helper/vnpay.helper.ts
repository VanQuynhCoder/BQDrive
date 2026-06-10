import crypto from "crypto";
import * as qs from "qs";

type CreateVnpayPaymentInput = {
  amount: number;
  orderId: string;
  orderInfo: string;
  ipAddr: string;
};

function sortObject(obj: Record<string, any>) {
  const sorted: Record<string, any> = {};

  const keys = Object.keys(obj).sort();

  for (const key of keys) {
    if (
      obj[key] !== undefined &&
      obj[key] !== null &&
      obj[key] !== ""
    ) {
      sorted[key] = obj[key];
    }
  }

  return sorted;
}

function formatDate(date: Date) {
  const yyyy = date.getFullYear();
  const MM = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const HH = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");

  return `${yyyy}${MM}${dd}${HH}${mm}${ss}`;
}

function getSignData(params: Record<string, any>) {
  const sorted = sortObject(params);

  return Object.keys(sorted)
    .map((key) => {
      return `${encodeURIComponent(key)}=${encodeURIComponent(sorted[key]).replace(
        /%20/g,
        "+"
      )}`;
    })
    .join("&");
}

export function createVnpayPaymentUrl({
  amount,
  orderId,
  orderInfo,
  ipAddr,
}: CreateVnpayPaymentInput) {
  const vnpUrl =
    process.env.VNPAY_URL ||
    "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";

  const tmnCode = process.env.VNPAY_TMN_CODE?.trim();
  const secretKey = process.env.VNPAY_HASH_SECRET?.trim();
  const returnUrl =
    process.env.VNPAY_RETURN_URL?.trim() ||
    "http://localhost:5173/payment-result";

  if (!tmnCode || !secretKey) {
    throw new Error("Thiếu VNPAY_TMN_CODE hoặc VNPAY_HASH_SECRET");
  }

  const createDate = formatDate(new Date());

  const vnpParams: Record<string, any> = {
    vnp_Version: "2.1.0",
    vnp_Command: "pay",
    vnp_TmnCode: tmnCode,
    vnp_Amount: Math.round(Number(amount) * 100),
    vnp_CurrCode: "VND",
    vnp_TxnRef: orderId,
    vnp_OrderInfo: orderInfo,
    vnp_OrderType: "other",
    vnp_Locale: "vn",
    vnp_ReturnUrl: returnUrl,
    vnp_IpAddr: ipAddr || "127.0.0.1",
    vnp_CreateDate: createDate,
  };

  const sortedParams = sortObject(vnpParams);
  const signData = getSignData(sortedParams);

  const secureHash = crypto
    .createHmac("sha512", secretKey)
    .update(Buffer.from(signData, "utf-8"))
    .digest("hex");

  sortedParams.vnp_SecureHash = secureHash;

  return `${vnpUrl}?${qs.stringify(sortedParams, {
    encode: false,
  })}`;
}

export function verifyVnpayReturn(query: Record<string, any>) {
  const secretKey = process.env.VNPAY_HASH_SECRET?.trim();

  if (!secretKey) {
    throw new Error("Thiếu VNPAY_HASH_SECRET");
  }

  const vnpParams: Record<string, any> = { ...query };
  const secureHash = String(vnpParams.vnp_SecureHash || "");

  delete vnpParams.vnp_SecureHash;
  delete vnpParams.vnp_SecureHashType;

  const sortedParams = sortObject(vnpParams);
  const signData = getSignData(sortedParams);

  const signed = crypto
    .createHmac("sha512", secretKey)
    .update(Buffer.from(signData, "utf-8"))
    .digest("hex");

  return signed === secureHash;
}