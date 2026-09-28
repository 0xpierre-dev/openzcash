CREATE TABLE "zarvis_feedback_reasons" (
	"day" date NOT NULL,
	"route" text NOT NULL,
	"reason" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "zarvis_feedback_reasons_day_route_reason_pk" PRIMARY KEY("day","route","reason")
);
