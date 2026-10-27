import { IOrder } from "../../models/order.model";

export interface StandardShipmentResult {
  shipmentId: string;
  trackingNumber?: string;
  carrier?: string;
  status: string;
  labelUrl?: string;
  manifestUrl?: string;
  invoiceUrl?: string;
  estimatedDelivery?: string;
  // Opaque provider-specific bag, copied verbatim into order.shippingMeta by
  // ShippingService. e.g. ShipRocket's numeric order_id (distinct from
  // shipment_id) which only that provider's own cancel call needs.
  providerMeta?: Record<string, unknown>;
}

export interface TrackingCheckpointResult {
  time: string;
  message: string;
  location: string;
}

export interface StandardTrackingResult {
  status: string;
  trackingNumber?: string;
  carrier?: string;
  trackingUrl?: string;
  estimatedDelivery?: string;
  checkpoints: TrackingCheckpointResult[];
}

export type ShippingRateItem = Pick<
  IOrder["items"][number],
  "product" | "name" | "quantity"
>;

export interface StandardShippingRate {
  charge: number;
  courierCompanyId: number;
  courierName?: string;
}

export interface IShippingProvider {
  readonly slug: string;
  calculateShippingRate?(
    items: ShippingRateItem[],
    deliveryPostcode: string,
    paymentMethod: "cod" | "prepaid",
    declaredValue: number,
  ): Promise<StandardShippingRate>;
  createShipment(order: IOrder): Promise<StandardShipmentResult>;
  cancelShipment(order: IOrder): Promise<void>;
  trackShipment(order: IOrder): Promise<StandardTrackingResult>;
  downloadLabel(order: IOrder): Promise<{ labelUrl: string }>;
  generateInvoice(order: IOrder): Promise<{ invoiceUrl: string }>;
  testConnection(): Promise<void>;
}
