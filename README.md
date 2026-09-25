# TP4 — Sesiones de pago y webhook Stripe

Microservicio HTTP desarrollado con **NestJS** que crea Checkout Sessions de Stripe y recibe webhooks cuando se concreta un pago.

El proyecto utiliza el modo **test** de Stripe. No procesa pagos reales.

## Funcionalidades

- Crear una Checkout Session de Stripe desde una API REST.
- Validar el request con DTOs, `class-validator` y un `ValidationPipe` global.
- Guardar el `orderId` en `payment_intent_data.metadata`.
- Redirigir al usuario al Checkout de Stripe.
- Exponer las rutas de éxito y cancelación.
- Recibir `POST /payments/webhook`.
- Verificar el header `stripe-signature` usando el cuerpo crudo del request.
- Registrar el `orderId` al recibir un evento `charge.succeeded`.
- Responder `400` ante firmas inválidas y `200` ante eventos procesados o no manejados.

## Tecnologías

- Node.js y TypeScript.
- NestJS.
- SDK de Stripe para Node.js.
- `@nestjs/config` y Joi.
- `class-validator` y `class-transformer`.
- Stripe CLI para probar webhooks localmente.
- Postman u otro cliente HTTP.

## Requisitos

- Node.js 20.11 o superior recomendado.
- npm.
- Una cuenta de Stripe.
- Stripe CLI para las pruebas locales del webhook.

## Estructura del proyecto

```text
src/
├── main.ts
├── app.module.ts
└── payments/
    ├── payments.controller.ts
    ├── payments.module.ts
    ├── payments.service.ts
    └── dto/
        ├── create-payment-session.dto.ts
        └── payment-item.dto.ts
```

Responsabilidades principales:

- `payments.controller.ts`: rutas HTTP.
- `payments.service.ts`: creación de la sesión en Stripe, verificación del webhook y logging.
- DTOs: validación de los datos de entrada.
- `payments.module.ts`: registro de las dependencias de NestJS.
- `app.module.ts`: configuración global.
- `main.ts`: inicialización de la aplicación, `rawBody` y `ValidationPipe` global.

## Configuración

Copiar el archivo de variables de entorno:

### Windows PowerShell

```powershell
Copy-Item .env.template .env
```

Completar `.env` con valores de prueba:

```env
PORT=3003
STRIPE_SECRET=sk_test_...
STRIPE_SUCCESS_URL=http://localhost:3003/payments/success
STRIPE_CANCEL_URL=http://localhost:3003/payments/cancel
STRIPE_ENDPOINT_SECRET=whsec_...
```

No se debe subir el archivo real `.env` al repositorio. El archivo `.gitignore` ya lo excluye.

### Variables

| Variable | Descripción |
|---|---|
| `PORT` | Puerto HTTP. El proyecto utiliza `3003`. |
| `STRIPE_SECRET` | Secret key de prueba de Stripe, comienza con `sk_test_`. |
| `STRIPE_SUCCESS_URL` | URL de redirección después de un pago exitoso. |
| `STRIPE_CANCEL_URL` | URL de redirección después de cancelar un pago. |
| `STRIPE_ENDPOINT_SECRET` | Secreto de firma del webhook, comienza con `whsec_`. |

### Dónde obtener los valores de Stripe

1. Abrir el Dashboard de Stripe en **Test mode**.
2. Entrar en **Developers → API keys**.
3. Copiar la **Secret key** de prueba en `STRIPE_SECRET`.
4. No utilizar una clave live (`sk_live_...`) para este trabajo.

El `STRIPE_ENDPOINT_SECRET` se obtiene con Stripe CLI:

```powershell
stripe login
stripe listen --forward-to http://localhost:3003/payments/webhook --events=charge.succeeded
```

Copiar el valor `whsec_...` mostrado por la CLI en `.env` y reiniciar el servidor NestJS. El secreto de firma pertenece al listener local del webhook; no es el mismo que `STRIPE_SECRET`.

## Instalación y ejecución

Instalar dependencias:

```powershell
npm install
```

Si npm muestra un problema de resolución de peer dependencies, utilizar:

```powershell
npm install --legacy-peer-deps
```

Iniciar el servidor de desarrollo:

```powershell
npm run start:dev
```

La aplicación estará disponible en:

```text
http://localhost:3003
```

Compilar el proyecto:

```powershell
npm run build
```

## Endpoints de la API

URL base:

```text
http://localhost:3003
```

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/payments/create-payment-session` | Crea una Checkout Session de Stripe. |
| `GET` | `/payments/success` | Respuesta luego de una redirección exitosa. |
| `GET` | `/payments/cancel` | Respuesta luego de cancelar un pago. |
| `POST` | `/payments/webhook` | Recibe eventos del webhook de Stripe. |

### Crear una sesión de pago

Request:

```http
POST /payments/create-payment-session
Content-Type: application/json
```

```json
{
  "orderId": "ord-1",
  "currency": "usd",
  "items": [
    {
      "name": "Producto",
      "price": 20,
      "quantity": 1
    }
  ]
}
```

`price` se recibe en la unidad principal de la moneda. El service lo convierte a centavos antes de enviarlo a Stripe:

```ts
Math.round(price * 100)
```

Por lo tanto, `20` se envía a Stripe como `2000` centavos.

Respuesta esperada:

```json
{
  "id": "cs_test_...",
  "url": "https://checkout.stripe.com/..."
}
```

La `url` es la página de Checkout alojada por Stripe. Se debe abrir en el navegador para completar el pago de prueba.

El request también envía la siguiente metadata al PaymentIntent:

```ts
payment_intent_data: {
  metadata: {
    orderId: dto.orderId,
  },
},
```

### Ruta de éxito

```http
GET /payments/success
```

```json
{
  "ok": true,
  "message": "Payment successful"
}
```

Esta ruta solamente confirma la redirección del usuario. El webhook es la fuente de verdad sobre el estado del pago.

### Ruta de cancelación

```http
GET /payments/cancel
```

```json
{
  "ok": false,
  "message": "Payment cancelled"
}
```

## Validaciones

La aplicación utiliza un `ValidationPipe` global configurado así:

```ts
new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
```

La API responde `400 Bad Request`, por ejemplo, cuando:

- `items` falta o está vacío.
- Un precio es negativo.
- Una cantidad no es válida.
- Se envía un campo desconocido.

El request se valida antes de llamar a Stripe.

## Webhook

La ruta del webhook es:

```http
POST /payments/webhook
```

No es una ruta `GET`. Al abrir la URL directamente en el navegador se obtiene:

```json
{
  "message": "Cannot GET /payments/webhook",
  "statusCode": 404
}
```

Esa respuesta es esperada y solamente confirma que el servidor está funcionando.

Stripe envía el evento con el header `stripe-signature`. La aplicación lee el cuerpo original del request mediante `rawBody` y lo verifica con:

```ts
stripe.webhooks.constructEvent(
  rawBody,
  signature,
  endpointSecret,
);
```

Comportamiento:

- Firma inválida o ausente: `400 Bad Request`; el evento no se procesa.
- `charge.succeeded`: se lee el `orderId` de la metadata y se registra en el log.
- Otros tipos de evento: se registran como no manejados y se responde `200`.

Un webhook exitoso produce un log similar a:

```text
[PaymentsService] Payment succeeded. orderId=ord-1
```

## Prueba local del webhook

Usar dos terminales.

### Terminal 1 — NestJS

```powershell
npm run start:dev
```

### Terminal 2 — Stripe CLI

```powershell
stripe listen --forward-to http://localhost:3003/payments/webhook --events=charge.succeeded
```

Esperar a que la CLI muestre `Ready!`. Luego crear una Checkout Session **nueva** desde Postman y abrir la `url` devuelta. Pagar con la tarjeta de prueba de Stripe:

```text
4242 4242 4242 4242
```

Se puede utilizar cualquier fecha futura y cualquier CVC, por ejemplo:

```text
Vencimiento: 12/34
CVC: 123
```

Después del pago, la CLI de Stripe debería mostrar `charge.succeeded` y la terminal de NestJS debería mostrar el log con el `orderId`.

Un POST manual realizado desde Postman sin un `stripe-signature` válido debe devolver `400`; solamente es una prueba negativa y no simula un pago real.

## Evidencias sugeridas para la entrega

Guardar evidencia de:

1. Request y response válidos en Postman, con `id` y `url`.
2. Response `400` para un request inválido.
3. Salida de Stripe CLI mostrando `charge.succeeded`.
4. Log de NestJS mostrando el `orderId` recibido.
5. Presencia de `.env.template` y de este `README.md`.

Nunca incluir secretos reales de Stripe en capturas, logs o en el repositorio.

## Fuera de alcance

Este trabajo no incluye:

- Integración con un microservicio de órdenes.
- NATS/TCP.
- Reembolsos.
- Modo live de Stripe.
- Una aplicación frontend.
