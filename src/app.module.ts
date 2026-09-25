import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';
import { PaymentsModule } from './payments/payments.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,

      validationSchema: Joi.object({
        PORT: Joi.number().port().default(3003),

        STRIPE_SECRET: Joi.string().required(),

        STRIPE_SUCCESS_URL: Joi.string().uri().required(),

        STRIPE_CANCEL_URL: Joi.string().uri().required(),

        STRIPE_ENDPOINT_SECRET: Joi.string().required(),
      }),
    }),

    PaymentsModule,
  ],
})
export class AppModule {}