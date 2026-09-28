CREATE TABLE "zarvis_canary" (
	"ran_at" timestamp with time zone PRIMARY KEY NOT NULL,
	"ok" boolean NOT NULL,
	"passed" integer NOT NULL,
	"failed" integer NOT NULL,
	"ms" integer NOT NULL,
	"failed_cases" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zarvis_metrics_daily" (
	"day" date NOT NULL,
	"route" text NOT NULL,
	"completed" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"aborted" integer DEFAULT 0 NOT NULL,
	"quota" integer DEFAULT 0 NOT NULL,
	"busy" integer DEFAULT 0 NOT NULL,
	"spend_cap" integer DEFAULT 0 NOT NULL,
	"model_calls" integer DEFAULT 0 NOT NULL,
	"web_search_calls" integer DEFAULT 0 NOT NULL,
	"input_tokens" bigint DEFAULT 0 NOT NULL,
	"cached_input_tokens" bigint DEFAULT 0 NOT NULL,
	"output_tokens" bigint DEFAULT 0 NOT NULL,
	"grounding_fallbacks" integer DEFAULT 0 NOT NULL,
	"unpriced_requests" integer DEFAULT 0 NOT NULL,
	"helpful" integer DEFAULT 0 NOT NULL,
	"unhelpful" integer DEFAULT 0 NOT NULL,
	"estimated_usd" double precision DEFAULT 0 NOT NULL,
	"latency" integer[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "zarvis_metrics_daily_day_route_pk" PRIMARY KEY("day","route")
);
