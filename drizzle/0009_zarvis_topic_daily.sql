CREATE TABLE "zarvis_topic_daily" (
	"day" date NOT NULL,
	"route" text NOT NULL,
	"topic" text NOT NULL,
	"lang" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "zarvis_topic_daily_day_route_topic_lang_pk" PRIMARY KEY("day","route","topic","lang")
);
