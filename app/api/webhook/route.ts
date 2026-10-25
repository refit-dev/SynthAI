import {headers} from 'next/headers'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { stripe } from '../../../lib/stripe'
import prismadb from '../../../lib/prismadb'

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

function getSubscriptionPeriodEnd(subscription: object, planItem?: PlanItem): number {
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
function getInvoiceSubscription<T extends object>(invoice: T): InvoiceSubscription<T> {
  const legacy: unknown = Reflect.get(invoice, 'subscription');
  const parent: unknown = Reflect.get(invoice, 'parent');
  const details: unknown =
    parent && typeof parent === 'object' ? Reflect.get(parent, 'subscription_details') : undefined;
  const moved: unknown =
    details && typeof details === 'object' ? Reflect.get(details, 'subscription') : undefined;
  return (legacy !== undefined ? legacy : (moved ?? null)) as InvoiceSubscription<T>;
}

export async function POST(req:Request){
    // getting the body which will further be used for webhook signature verification  and construction of event 
    const body=await req.text()
    //getting the signature that stripe sent for webhook verification
    const signature=headers().get('Stripe-signature') as string
    //getting the event from stripe
    let event : Stripe.Event
    try{
        event = stripe.webhooks.constructEvent(
            body,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET
          );

    }catch(error:any){
        // console.log(`⚠️Webhook signature verification failed.`, err.message);
        return new NextResponse(`⚠️Webhook error:${error.message}`,{status:400})
    }

    //now this webhook will give a event object
    const session=event.data.object as Stripe.Checkout.Session
    //now using this event data object we will filter out the retrive process and the type of event we are triggering

    //case1- if the user is newly to pro plan so we need to provide a checkout page and payment success

    if(event.type ==='checkout.session.completed'){
        //retrive the current subscription of the user
        const subscription=await stripe.subscriptions.retrieve(
            session.subscription as string
        )
        //now if the session metadata doesnt exist means userId
        //so we can not subscribe
        if(!session?.metadata?.userId){
            return new NextResponse('user id is required!',{status:400})
        }
        //now if metadata exists
        //so we just cretate the user subscription in the database
        //create the user as this user will be a new user in pro plan
        await prismadb.userSubscription.create({
          data:{
            userId:session?.metadata?.userId,
            stripeSubscriptionId:subscription.id,
            stripeCustomerId:subscription.customer as string,
            stripePriceId:subscription.items.data[0].price.id,
            stripeCurrentPeriodEnd:new Date(
                (getSubscriptionPeriodEnd(subscription, (items) => items[0]))*1000
            )
          }  
        })
    }

    // case2-user already subscribed he just wanted to renew/update the subscription
    if(event.type === 'invoice.payment_succeeded'){
        const subscription=await stripe.subscriptions.retrieve(
            (getInvoiceSubscription(session)) as string
        )

        await prismadb.userSubscription.update({
        where:{
            stripeSubscriptionId:subscription.id,
        },
        data:{
            stripePriceId:subscription.items.data[0].price.id,
            stripeCurrentPeriodEnd:new Date(
                (getSubscriptionPeriodEnd(subscription, (items) => items[0]))*1000
            ),
        }
        })
    }
    //this returning is very important to keep the webhooks away from any mess
    //just return null and a status ok(200)
    return new NextResponse(null,{status:200})
} 