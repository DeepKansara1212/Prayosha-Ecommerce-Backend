import { IOrder } from "../../models/order.model";

export interface StandardShipmentResult {
  shipmentId: string;
  trackingNumber?: string;
  carrier?: string;
  status: string;
  labelUrl?: string;
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

export interface IShippingProvider {
  readonly slug: string;
  createShipment(order: IOrder): Promise<StandardShipmentResult>;
  cancelShipment(order: IOrder): Promise<void>;
  trackShipment(order: IOrder): Promise<StandardTrackingResult>;
  downloadLabel(order: IOrder): Promise<{ labelUrl: string }>;
  generateInvoice(order: IOrder): Promise<{ invoiceUrl: string }>;
}
