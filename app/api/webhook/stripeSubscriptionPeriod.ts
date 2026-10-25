type PeriodItem = { price?: { id?: string } | null };
type PeriodField = 'current_period_start' | 'current_period_end';
type PlanItem = (items: PeriodItem[]) => PeriodItem | undefined;

// Typed like the removed field, which was also absent at runtime when Stripe omitted it.
function subscriptionPeriod(subscription: object, field: PeriodField, planItem?: PlanItem): number {
  const legacy: unknown = Reflect.get(subscription, field);
  if (typeof legacy === 'number') return legacy;
  const list: unknown = Reflect.get(subscription, 'items');
  const data: unknown = list && typeof list === 'object' ? Reflect.get(list, 'data') : undefined;
  const items = (Array.isArray(data) ? data : []).filter(
    (item): item is PeriodItem => typeof item === 'object' && item !== null,
  );
  const periods = new Set(items.map((item) => Reflect.get(item, field)));
  const chosen = periods.size === 1 ? items[0] : planItem?.(items);
  const value: unknown = chosen ? Reflect.get(chosen, field) : undefined;
  return (typeof value === 'number' ? value : undefined) as number;
}

export function getSubscriptionPeriodStart(subscription: object, planItem?: PlanItem): number {
  return subscriptionPeriod(subscription, 'current_period_start', planItem);
}

export function getSubscriptionPeriodEnd(subscription: object, planItem?: PlanItem): number {
  return subscriptionPeriod(subscription, 'current_period_end', planItem);
}

// Typed like the removed field under old stripe types, like the new location under new ones.
type InvoiceSubscription<T> = T extends { subscription: infer S }
  ? S
  : T extends { parent: infer P }
    ? NonNullable<P> extends { subscription_details: infer D }
      ? NonNullable<D> extends { subscription: infer S }
        ? S | null
        : string | null
      : string | null
    : string | null;

// The old top-level field when present (old-version payloads), otherwise the new location.
export function getInvoiceSubscription<T extends object>(invoice: T): InvoiceSubscription<T> {
  const legacy: unknown = Reflect.get(invoice, 'subscription');
  const parent: unknown = Reflect.get(invoice, 'parent');
  const details: unknown =
    parent && typeof parent === 'object' ? Reflect.get(parent, 'subscription_details') : undefined;
  const moved: unknown =
    details && typeof details === 'object' ? Reflect.get(details, 'subscription') : undefined;
  return (legacy !== undefined ? legacy : (moved ?? null)) as InvoiceSubscription<T>;
}

// The old Price object's ID when present (old-version payloads), otherwise the price at
// pricing.price_details: an ID, or a Price when expanded.
export function getInvoicePriceId(line: object): string | undefined {
  const legacy: unknown = Reflect.get(line, 'price');
  const pricing: unknown = legacy === undefined ? Reflect.get(line, 'pricing') : undefined;
  const details: unknown =
    pricing && typeof pricing === 'object' && Reflect.get(pricing, 'type') === 'price_details'
      ? Reflect.get(pricing, 'price_details')
      : undefined;
  const price: unknown =
    legacy !== undefined ? legacy : details && typeof details === 'object' ? Reflect.get(details, 'price') : undefined;
  const id: unknown = price && typeof price === 'object' ? Reflect.get(price, 'id') : price;
  return typeof id === 'string' ? id : undefined;
}

// Typed like the removed field under old stripe types, like the new location under new ones.
type CheckoutShippingDetails<T> = T extends { shipping_details: infer S }
  ? S
  : T extends { collected_information: infer C }
    ? NonNullable<C> extends { shipping_details: infer S }
      ? S | null
      : null
    : null;

// The old top-level field when present (old-version payloads), otherwise
// collected_information.shipping_details, which holds only address and name.
export function getCheckoutShippingDetails<T extends object>(session: T): CheckoutShippingDetails<T> {
  const legacy: unknown = Reflect.get(session, 'shipping_details');
  const collected: unknown = Reflect.get(session, 'collected_information');
  const moved: unknown =
    collected && typeof collected === 'object' ? Reflect.get(collected, 'shipping_details') : undefined;
  return (legacy !== undefined ? legacy : (moved ?? null)) as CheckoutShippingDetails<T>;
}

// The old auto-expanded Coupon's ID when present (old-version payloads), otherwise the coupon a
// promotion code's promotion or a discount's source holds: an ID, or a Coupon when expanded.
export function getCouponId(value: object): string | undefined {
  const legacy: unknown = Reflect.get(value, 'coupon');
  const holder: unknown =
    legacy === undefined ? (Reflect.get(value, 'promotion') ?? Reflect.get(value, 'source')) : undefined;
  const moved: unknown =
    holder && typeof holder === 'object' && Reflect.get(holder, 'type') === 'coupon'
      ? Reflect.get(holder, 'coupon')
      : undefined;
  const coupon: unknown = legacy !== undefined ? legacy : moved;
  const id: unknown = coupon && typeof coupon === 'object' ? Reflect.get(coupon, 'id') : coupon;
  return typeof id === 'string' ? id : undefined;
}

// Typed like the removed field under old stripe types, like the new name under new ones.
type ProductMarketingFeatures<T> = T extends { features: infer F }
  ? F
  : T extends { marketing_features: infer M }
    ? M
    : { name?: string }[];

// The old features list when present (old-version payloads), otherwise marketing_features.
export function getProductMarketingFeatures<T extends object>(product: T): ProductMarketingFeatures<T> {
  const legacy: unknown = Reflect.get(product, 'features');
  return (legacy !== undefined ? legacy : Reflect.get(product, 'marketing_features')) as ProductMarketingFeatures<T>;
}
