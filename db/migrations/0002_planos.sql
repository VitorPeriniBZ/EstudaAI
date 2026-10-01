CREATE TYPE "public"."user_plan" AS ENUM('free', 'pro');--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"kind" varchar(32) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "plan" "user_plan" DEFAULT 'free' NOT NULL;--> statement-breakpoint
CREATE INDEX "usage_user_created_idx" ON "usage_events" USING btree ("userId","createdAt");