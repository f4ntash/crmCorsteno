export type PaymentInternalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'refunded';

export type CheckoutInput = {
  paymentId: string;
  subscriptionId: string;
  title: string;
  amountMinor: number;
  currency: string;
};

export type ProviderPayment = {
  providerPaymentId: string;
  providerStatus: string;
  status: PaymentInternalStatus;
  amountMinor: number;
  currency: string;
  externalReference: string | null;
  paidAt: string | null;
};

export interface PaymentProvider {
  readonly name: 'mercado_pago';
  createCheckout(input: CheckoutInput): Promise<{ checkoutId: string; checkoutUrl: string }>;
  getPayment(providerPaymentId: string): Promise<ProviderPayment>;
  verifyWebhook(request: Request): Promise<boolean>;
}
