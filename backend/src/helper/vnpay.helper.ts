import axios from "axios";
import crypto from "crypto";
import * as qs from "qs";

type CreateVnpayPaymentInput = {
  amount: number;
  orderId: string;
  orderInfo: string;
  ipAddr: string;
};
type CreateVnpayRefundInput = {
  requestId: string;
  amount: number;
  orderId: string;
  transactionNo?: string;
  transactionDate: string;
  transactionType: "02" | "03";
  createBy: string;
  ipAddr: string;
  orderInfo: string;
};
type QueryVnpayTransactionInput = {
  requestId: string;
  orderId: string;
  transactionNo?: string;
  transactionDate: string;
  ipAddr: string;
  orderInfo: string;
};

function sortObject(obj: Record<string, any>) {
  const sorted: Record<string, any> = {};

  const keys = Object.keys(obj).sort();

  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== "") {
      sorted[key] = obj[key];
    }
  }

  return sorted;
}

function formatDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  const yyyy = parts.year;
  const MM = parts.month;
  const dd = parts.day;
  const HH = parts.hour;
  const mm = parts.minute;
  const ss = parts.second;

  return `${yyyy}${MM}${dd}${HH}${mm}${ss}`;
}

function getSignData(params: Record<string, any>) {
  const sorted = sortObject(params);

  return Object.keys(sorted)
    .map((key) => {
      return `${encodeURIComponent(key)}=${encodeURIComponent(
        sorted[key],
      ).replace(/%20/g, "+")}`;
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

  const payUrl = `${vnpUrl}?${qs.stringify(sortedParams, {
    encode: false,
  })}`;

  return {
    payUrl,
    transactionDate: createDate,
  };
}
export async function createVnpayRefund({
  requestId,
  amount,
  orderId,
  transactionNo,
  transactionDate,
  transactionType,
  createBy,
  ipAddr,
  orderInfo,
}: CreateVnpayRefundInput) {
  const endpoint =
    process.env.VNPAY_API_URL?.trim() ||
    "https://sandbox.vnpayment.vn/merchant_webapi/api/transaction";

  const tmnCode = process.env.VNPAY_TMN_CODE?.trim();
  const secretKey = process.env.VNPAY_HASH_SECRET?.trim();

  if (!tmnCode || !secretKey) {
    throw new Error(
      "Thiếu VNPAY_TMN_CODE hoặc VNPAY_HASH_SECRET",
    );
  }

  const normalizedAmount = Math.round(Number(amount) * 100);

  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    throw new Error("Số tiền hoàn VNPay không hợp lệ");
  }

  if (!requestId.trim()) {
    throw new Error("Thiếu requestId hoàn tiền VNPay");
  }

  if (!orderId.trim()) {
    throw new Error("Thiếu mã giao dịch gốc VNPay");
  }

  if (!transactionDate.trim()) {
    throw new Error("Thiếu ngày giao dịch gốc VNPay");
  }

  const createDate = formatDate(new Date());
  const normalizedTransactionNo = String(
    transactionNo || "",
  ).trim();

  const requestBody: Record<string, any> = {
    vnp_RequestId: requestId.trim(),
    vnp_Version: "2.1.0",
    vnp_Command: "refund",
    vnp_TmnCode: tmnCode,
    vnp_TransactionType: transactionType,
    vnp_TxnRef: orderId.trim(),
    vnp_Amount: normalizedAmount,
    vnp_TransactionNo: normalizedTransactionNo,
    vnp_TransactionDate: transactionDate.trim(),
    vnp_CreateBy: createBy.trim() || "BQDrive",
    vnp_CreateDate: createDate,
    vnp_IpAddr: ipAddr || "127.0.0.1",
    vnp_OrderInfo: orderInfo.trim(),
  };

  const rawSignature = [
    requestBody.vnp_RequestId,
    requestBody.vnp_Version,
    requestBody.vnp_Command,
    requestBody.vnp_TmnCode,
    requestBody.vnp_TransactionType,
    requestBody.vnp_TxnRef,
    requestBody.vnp_Amount,
    requestBody.vnp_TransactionNo,
    requestBody.vnp_TransactionDate,
    requestBody.vnp_CreateBy,
    requestBody.vnp_CreateDate,
    requestBody.vnp_IpAddr,
    requestBody.vnp_OrderInfo,
  ].join("|");

  requestBody.vnp_SecureHash = crypto
    .createHmac("sha512", secretKey)
    .update(Buffer.from(rawSignature, "utf-8"))
    .digest("hex");

  const response = await axios.post(endpoint, requestBody, {
    headers: {
      "Content-Type": "application/json",
    },
  });

  const responseData = response.data as Record<string, any>;
  /*
 * VNPay có thể trả mã 94 khi QueryDr được gọi lặp lại
 * trong thời gian giới hạn. Sandbox có thể chỉ trả
 * responseCode/message và không kèm SecureHash.
 *
 * Đây không phải kết quả cuối của giao dịch hoàn tiền,
 * nên trả về để service giữ trạng thái PROCESSING.
 */
if (
  String(responseData.vnp_ResponseCode || "").trim() === "94" &&
  !String(responseData.vnp_SecureHash || "").trim()
) {
  return responseData;
}

  if (!verifyVnpayRefundResponse(responseData, secretKey)) {
    throw new Error(
      "Chữ ký phản hồi hoàn tiền VNPay không hợp lệ",
    );
  }

  return responseData;
}
export async function queryVnpayTransaction({
  requestId,
  orderId,
  transactionNo,
  transactionDate,
  ipAddr,
  orderInfo,
}: QueryVnpayTransactionInput) {
  const endpoint =
    process.env.VNPAY_API_URL?.trim() ||
    "https://sandbox.vnpayment.vn/merchant_webapi/api/transaction";

  const tmnCode = process.env.VNPAY_TMN_CODE?.trim();
  const secretKey = process.env.VNPAY_HASH_SECRET?.trim();

  if (!tmnCode || !secretKey) {
    throw new Error(
      "Thiếu VNPAY_TMN_CODE hoặc VNPAY_HASH_SECRET",
    );
  }

  if (!requestId.trim()) {
    throw new Error("Thiếu requestId truy vấn VNPay");
  }

  if (!orderId.trim()) {
    throw new Error("Thiếu mã giao dịch gốc VNPay");
  }

  if (!transactionDate.trim()) {
    throw new Error("Thiếu ngày giao dịch gốc VNPay");
  }

  const createDate = formatDate(new Date());

  const normalizedTransactionNo = String(
    transactionNo || "",
  ).trim();

  const requestBody: Record<string, any> = {
    vnp_RequestId: requestId.trim(),
    vnp_Version: "2.1.0",
    vnp_Command: "querydr",
    vnp_TmnCode: tmnCode,
    vnp_TxnRef: orderId.trim(),

    vnp_TransactionDate: transactionDate.trim(),

    vnp_CreateDate: createDate,
    vnp_IpAddr: ipAddr || "127.0.0.1",
    vnp_OrderInfo: orderInfo.trim(),
  };

  /*
   * vnp_TransactionNo là tùy chọn.
   * Chỉ gửi khi giao dịch gốc có mã VNPay.
   */
  if (normalizedTransactionNo) {
    requestBody.vnp_TransactionNo =
      normalizedTransactionNo;
  }

  /*
   * Theo đặc tả VNPay QueryDr,
   * vnp_TransactionNo không nằm trong chuỗi checksum request.
   */
  const rawSignature = [
    requestBody.vnp_RequestId,
    requestBody.vnp_Version,
    requestBody.vnp_Command,
    requestBody.vnp_TmnCode,
    requestBody.vnp_TxnRef,
    requestBody.vnp_TransactionDate,
    requestBody.vnp_CreateDate,
    requestBody.vnp_IpAddr,
    requestBody.vnp_OrderInfo,
  ].join("|");

  requestBody.vnp_SecureHash = crypto
    .createHmac("sha512", secretKey)
    .update(Buffer.from(rawSignature, "utf-8"))
    .digest("hex");

  const response = await axios.post(
    endpoint,
    requestBody,
    {
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

  const responseData = response.data as Record<
    string,
    any
  >;

  if (
    !verifyVnpayQueryResponse(
      responseData,
      secretKey,
    )
  ) {
    throw new Error(
      "Chữ ký phản hồi truy vấn VNPay không hợp lệ",
    );
  }

  return responseData;
}
function verifyVnpayQueryResponse(
  data: Record<string, any>,
  secretKey: string,
) {
  const rawData = [
    String(data.vnp_ResponseId || ""),
    String(data.vnp_Command || ""),
    String(data.vnp_ResponseCode || ""),
    String(data.vnp_Message || ""),
    String(data.vnp_TmnCode || ""),
    String(data.vnp_TxnRef || ""),
    String(data.vnp_Amount || ""),
    String(data.vnp_BankCode || ""),
    String(data.vnp_PayDate || ""),
    String(data.vnp_TransactionNo || ""),
    String(data.vnp_TransactionType || ""),
    String(data.vnp_TransactionStatus || ""),
    String(data.vnp_OrderInfo || ""),
    String(data.vnp_PromotionCode || ""),
    String(data.vnp_PromotionAmount || ""),
  ].join("|");

  const signed = crypto
    .createHmac("sha512", secretKey)
    .update(Buffer.from(rawData, "utf-8"))
    .digest("hex");

  const receivedHash = String(
    data.vnp_SecureHash || "",
  ).trim();

  const isValid =
    signed.toLowerCase() ===
    receivedHash.toLowerCase();

  /*
   * Chỉ log khi checksum không khớp.
   * Không ghi secretKey ra terminal.
   */
  if (!isValid) {
    console.error(
      "[BQDrive][VNPay QueryDr] Chữ ký phản hồi không hợp lệ:",
      {
        rawData,
        calculatedHash: signed,
        receivedHash,
        response: {
          vnp_ResponseId: data.vnp_ResponseId,
          vnp_Command: data.vnp_Command,
          vnp_ResponseCode: data.vnp_ResponseCode,
          vnp_Message: data.vnp_Message,
          vnp_TmnCode: data.vnp_TmnCode,
          vnp_TxnRef: data.vnp_TxnRef,
          vnp_Amount: data.vnp_Amount,
          vnp_BankCode: data.vnp_BankCode,
          vnp_PayDate: data.vnp_PayDate,
          vnp_TransactionNo:
            data.vnp_TransactionNo,
          vnp_TransactionType:
            data.vnp_TransactionType,
          vnp_TransactionStatus:
            data.vnp_TransactionStatus,
          vnp_OrderInfo: data.vnp_OrderInfo,
          vnp_PromotionCode:
            data.vnp_PromotionCode,
          vnp_PromotionAmount:
            data.vnp_PromotionAmount,
        },
      },
    );
  }

  return isValid;
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
function verifyVnpayRefundResponse(
  data: Record<string, any>,
  secretKey: string,
) {
  const rawData = [
    String(data.vnp_ResponseId || ""),
    String(data.vnp_Command || ""),
    String(data.vnp_ResponseCode || ""),
    String(data.vnp_Message || ""),
    String(data.vnp_TmnCode || ""),
    String(data.vnp_TxnRef || ""),
    String(data.vnp_Amount || ""),
    String(data.vnp_BankCode || ""),
    String(data.vnp_PayDate || ""),
    String(data.vnp_TransactionNo || ""),
    String(data.vnp_TransactionType || ""),
    String(data.vnp_TransactionStatus || ""),
    String(data.vnp_OrderInfo || ""),
  ].join("|");

  const signed = crypto
    .createHmac("sha512", secretKey)
    .update(Buffer.from(rawData, "utf-8"))
    .digest("hex");

  return signed === String(data.vnp_SecureHash || "");
}