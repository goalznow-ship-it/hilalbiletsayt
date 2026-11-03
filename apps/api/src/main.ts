import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Trust only configured proxy addresses, never arbitrary forwarded headers.
  const trustedProxies = process.env.API_TRUSTED_PROXIES?.split(",")
    .map((address) => address.trim())
    .filter(Boolean);
  if (trustedProxies?.length) {
    app.getHttpAdapter().getInstance().set("trust proxy", trustedProxies);
  }

  app.getHttpAdapter().getInstance().disable("x-powered-by");
  app.setGlobalPrefix("api");
  // Production requires an explicit allow-list (enforced by env validation);
  // development falls back to the local web app only.
  const corsOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // API documentation is a development aid only; never served in production.
  if (process.env.NODE_ENV !== "production") {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("Hilal Bilet Sistemi API")
      .setDescription(
        "Centralized examination ticket sales and OMR result management API",
      )
      .setVersion("0.1.0")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("api/docs", app, document);
  }

  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  await app.listen(port, process.env.API_HOST || "0.0.0.0");
}

void bootstrap();
