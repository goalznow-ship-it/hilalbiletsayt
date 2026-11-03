/// <reference types="vitest" />
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "./app.module";

describe("Rate Limiting Integration", () => {
  // === LOGIN ENDPOINT TESTS ===
  describe("Login endpoint: 10 requests per 60000ms", () => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .compile();
      app = moduleRef.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it("requests 1-10 are allowed (not 429)", async () => {
      for (let i = 1; i <= 10; i++) {
        const response = await request(app.getHttpServer())
          .post("/auth/login")
          .send({ email: `user${i}@test.com`, password: "invalid" });
        expect(response.status).not.toBe(429);
      }
    });

    it("request 11 returns HTTP 429 (rate limit exceeded)", async () => {
      const response = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "user11@test.com", password: "invalid" });
      expect(response.status).toBe(429);
    });
  });

  // === GENERAL API TESTS ===
  describe("General API: 60 requests per 60000ms", () => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .compile();
      app = moduleRef.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it("requests 1-60 are allowed (not 429)", async () => {
      for (let i = 1; i <= 60; i++) {
        const response = await request(app.getHttpServer()).get("/auth/me");
        expect(response.status).not.toBe(429);
      }
    });

    it("request 61 returns HTTP 429 (rate limit exceeded)", async () => {
      const response = await request(app.getHttpServer()).get("/auth/me");
      expect(response.status).toBe(429);
    });
  });

  // === HEALTH TESTS ===
  describe("Health endpoint: exempt from throttling", () => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .compile();
      app = moduleRef.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it("70 health requests remain accessible", async () => {
      for (let i = 1; i <= 70; i++) {
        const response = await request(app.getHttpServer()).get("/health");
        expect(response.status).toBe(200);
      }
    });
  });
});
