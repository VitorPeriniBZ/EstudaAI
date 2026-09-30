CREATE TYPE "public"."ai_provider_type" AS ENUM('anthropic', 'openai');--> statement-breakpoint
CREATE TYPE "public"."chat_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."material_kind" AS ENUM('pdf', 'image', 'note');--> statement-breakpoint
CREATE TYPE "public"."material_status" AS ENUM('processing', 'ready', 'error');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "ai_providers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"type" "ai_provider_type" NOT NULL,
	"baseUrl" varchar(500),
	"apiKey" text,
	"model" varchar(160) NOT NULL,
	"priority" integer DEFAULT 10 NOT NULL,
	"vision" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"lastTestAt" timestamp,
	"lastTestOk" boolean,
	"lastTestMsg" varchar(500),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"subjectId" integer NOT NULL,
	"userId" integer NOT NULL,
	"role" "chat_role" NOT NULL,
	"content" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"contentType" varchar(120) NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flashcards" (
	"id" serial PRIMARY KEY NOT NULL,
	"subjectId" integer NOT NULL,
	"userId" integer NOT NULL,
	"front" text NOT NULL,
	"back" text NOT NULL,
	"mastery" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"id" serial PRIMARY KEY NOT NULL,
	"subjectId" integer NOT NULL,
	"userId" integer NOT NULL,
	"kind" "material_kind" NOT NULL,
	"title" varchar(255) NOT NULL,
	"fileKey" varchar(512),
	"fileSize" integer,
	"textContent" text,
	"status" "material_status" DEFAULT 'processing' NOT NULL,
	"statusMsg" varchar(500),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"quizId" integer NOT NULL,
	"subjectId" integer NOT NULL,
	"topic" varchar(160) DEFAULT 'Geral' NOT NULL,
	"text" text NOT NULL,
	"options" jsonb NOT NULL,
	"answerIndex" integer NOT NULL,
	"explanation" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"quizId" integer NOT NULL,
	"subjectId" integer NOT NULL,
	"userId" integer NOT NULL,
	"total" integer NOT NULL,
	"correct" integer NOT NULL,
	"wrongQuestionIds" jsonb NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quizzes" (
	"id" serial PRIMARY KEY NOT NULL,
	"subjectId" integer NOT NULL,
	"userId" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text,
	"color" varchar(24) DEFAULT 'hema' NOT NULL,
	"summary" text,
	"summaryAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"googleSub" varchar(255) NOT NULL,
	"name" varchar(255),
	"email" varchar(320),
	"avatar" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignInAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_googleSub_unique" UNIQUE("googleSub")
);
--> statement-breakpoint
CREATE INDEX "chat_subject_idx" ON "chat_messages" USING btree ("subjectId");--> statement-breakpoint
CREATE INDEX "files_user_idx" ON "files" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "flashcards_subject_idx" ON "flashcards" USING btree ("subjectId");--> statement-breakpoint
CREATE INDEX "materials_subject_idx" ON "materials" USING btree ("subjectId");--> statement-breakpoint
CREATE INDEX "questions_quiz_idx" ON "questions" USING btree ("quizId");--> statement-breakpoint
CREATE INDEX "questions_subject_idx" ON "questions" USING btree ("subjectId");--> statement-breakpoint
CREATE INDEX "attempts_quiz_idx" ON "quiz_attempts" USING btree ("quizId");--> statement-breakpoint
CREATE INDEX "quizzes_subject_idx" ON "quizzes" USING btree ("subjectId");--> statement-breakpoint
CREATE INDEX "subjects_user_idx" ON "subjects" USING btree ("userId");