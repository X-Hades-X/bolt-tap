// LNURL pre signed
export interface PresignedLnurl extends WithdrawResponseData {
  lnurl: string
}

export interface WithdrawResponseData {
  status: string,
  reason?: string
}

export interface PayResponseData {
  pr: string,
}

export type LnurlData = WithdrawRequestData | PayRequestData;

export interface WithdrawRequestData {
  tag: 'withdrawRequest',
  callback: string,
  k1: string,
  minWithdrawable: number, //msat
  maxWithdrawable: number, //msat
  defaultDescription?: string,
  payLink?: string,
  pinLimit?: number //msat
}

export interface PayRequestData {
  tag: "payRequest",
  callback: string,
  metadata?: string,
  minSendable: number, //msat
  maxSendable: number //msat
}
