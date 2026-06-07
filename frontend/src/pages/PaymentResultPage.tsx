import { useEffect } from "react";

export default function PaymentResultPage() {
  useEffect(() => {
    console.log("Payment return");
  }, []);

  return (
    <div>
      <h1>Kết quả thanh toán</h1>
      <p>Đang kiểm tra trạng thái giao dịch...</p>
    </div>
  );
}