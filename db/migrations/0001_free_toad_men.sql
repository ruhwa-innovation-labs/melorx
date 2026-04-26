CREATE TYPE "public"."review_status_enum" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "drug_interaction_review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drug1_rxcui" varchar NOT NULL,
	"drug2_rxcui" varchar NOT NULL,
	"severity" "severity_enum" NOT NULL,
	"mechanism" varchar,
	"management" varchar,
	"sources" jsonb[] DEFAULT '{}' NOT NULL,
	"confidence" numeric(3, 2) NOT NULL,
	"pattern_id" varchar NOT NULL,
	"source_sentence" text NOT NULL,
	"status" "review_status_enum" DEFAULT 'pending' NOT NULL,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"rejection_reason" varchar,
	"promoted_interaction_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "drug_interaction_review_drug1_rxcui_drug2_rxcui_pattern_id_source_sentence_unique" UNIQUE("drug1_rxcui","drug2_rxcui","pattern_id","source_sentence")
);
--> statement-breakpoint
CREATE TABLE "pipeline_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_name" varchar NOT NULL,
	"partition_id" varchar NOT NULL,
	"checksum" varchar NOT NULL,
	"records_processed" integer DEFAULT 0 NOT NULL,
	"last_ingested_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pipeline_state_source_name_partition_id_unique" UNIQUE("source_name","partition_id")
);
--> statement-breakpoint
ALTER TABLE "drug_concept" ALTER COLUMN "drug_class" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "drug_concept" ALTER COLUMN "identifiers" SET DEFAULT '{"ndc":[],"atc":null,"drugbank":null,"brand_names":[]}'::jsonb;--> statement-breakpoint
ALTER TABLE "drug_interaction" ALTER COLUMN "is_generated" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "drug_interaction_review" ADD CONSTRAINT "drug_interaction_review_promoted_interaction_id_drug_interaction_id_fk" FOREIGN KEY ("promoted_interaction_id") REFERENCES "public"."drug_interaction"("id") ON DELETE no action ON UPDATE no action;