import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { CreatePaymentSessionDto } from './dto/create-payment-session.dto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly stripe: Stripe;

  constructor(private readonly configService: ConfigService) {
    const secretKey =
      this.configService.getOrThrow<string>('STRIPE_SECRET');

    this.stripe = new Stripe(secretKey);
  }

  async createPaymentSession(dto: CreatePaymentSessionDto) {
    const currency = dto.currency.toLowerCase();

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',

      line_items: dto.items.map((item) => ({
        quantity: item.quantity,

        price_data: {
          currency,

          unit_amount: Math.round(item.price * 100),

          product_data: {
            name: item.name,
          },
        },
      })),

      payment_intent_data: {
        metadata: {
          orderId: dto.orderId,
        },
      },

      success_url:
        this.configService.getOrThrow<string>(
          'STRIPE_SUCCESS_URL',
        ),

      cancel_url:
        this.configService.getOrThrow<string>(
          'STRIPE_CANCEL_URL',
        ),
    });

    return {
      id: session.id,
      url: session.url,
    };
  }

  async handleWebhook(
    rawBody: Buffer,
    signature: string,
  ) {
    this.logger.log('Webhook request received');
    const endpointSecret =
      this.configService.getOrThrow<string>(
        'STRIPE_ENDPOINT_SECRET',
      );

    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        endpointSecret,
      );
    } catch {
      throw new BadRequestException(
        'Invalid Stripe webhook signature',
      );
    }

    if (event.type === 'charge.succeeded') {
      const charge = event.data.object as Stripe.Charge;

      const orderId = charge.metadata?.orderId;

      this.logger.log(
        `Payment succeeded. orderId=${orderId}`,
      );

      return {
        received: true,
      };
    }

    this.logger.warn(
      `Unhandled Stripe event: ${event.type}`,
    );

    return {
      received: true,
    };
  }
}