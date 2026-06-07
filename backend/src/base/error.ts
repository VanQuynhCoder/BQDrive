export interface IErrorInfo {
  status: number;
  code: string;
  message: string;
  data?: any;
}

export class BaseError extends Error {
  info: IErrorInfo;

  constructor(
    status: number,
    code: string,
    message: string,
    data?: any,
  ) {
    super(message);

    this.info = {
      status,
      code,
      message,
      data,
    };
  }
}

export class ErrorHelper extends BaseError {
  static unauthorized() {
    return new BaseError(
      401,
      "401",
      "Vui lòng đăng nhập",
    );
  }

  static permissionDeny() {
    return new BaseError(
      403,
      "-2",
      "Không đủ quyền truy cập",
    );
  }

  static requestDataInvalid(message?: string) {
    return new BaseError(
      400,
      "-3",
      "Dữ liệu không hợp lệ",
      message,
    );
  }

  static recordNotFound(message?: string) {
    return new BaseError(
      404,
      "-4",
      message || "Không tìm thấy dữ liệu",
    );
  }

  static userWasOut() {
    return new BaseError(
      401,
      "-5",
      "Phiên đăng nhập đã hết hạn",
    );
  }

  static userWasBlock() {
    return new BaseError(
      403,
      "-6",
      "Tài khoản đã bị khóa",
    );
  }

  static userNotExist() {
    return new BaseError(
      404,
      "-7",
      "Người dùng không tồn tại",
    );
  }

  static userExisted() {
    return new BaseError(
      409,
      "-8",
      "Email đã tồn tại",
    );
  }

  static userPasswordNotCorrect() {
    return new BaseError(
      400,
      "-9",
      "Mật khẩu không đúng",
    );
  }

  static forbidden(message?: string) {
    return new BaseError(
      403,
      "-10",
      message || "Forbidden",
    );
  }

  static somethingWentWrong(message?: string) {
    return new BaseError(
      500,
      "-11",
      message || "Có lỗi xảy ra",
    );
  }

  static badToken() {
    return new BaseError(
      401,
      "-12",
      "Token không hợp lệ",
    );
  }
}