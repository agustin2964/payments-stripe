import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Req,
} from '@nestjs/common';

import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';

import { CreatePaymentSessionDto } from './dto/create-payment-session.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
  ) {}

  @Post('create-payment-session')
  createPaymentSession(
    @Body() dto: CreatePaymentSessionDto,
  ) {
    return this.paymentsService.createPaymentSession(dto);
  }

  @Get('success')
  paymentSuccess() {
    return {
      ok: true,
      message: 'Payment successful',
    };
  }

  @Get('cancel')
  paymentCancelled() {
    return {
      ok: false,
      message: 'Payment cancelled',
    };
  }

  @Post('webhook')
  handleWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature')
    signature: string | undefined,
  ) {
    if (!request.rawBody || !signature) {
      throw new BadRequestException(
        'Missing webhook signature or raw body',
      );
    }

    return this.paymentsService.handleWebhook(
      request.rawBody,
      signature,
    );
  }
}