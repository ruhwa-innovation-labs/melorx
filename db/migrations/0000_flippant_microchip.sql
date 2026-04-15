CREATE TYPE "public"."severity_enum" AS ENUM('contraindicated', 'serious', 'moderate', 'minor', 'monitor');--> statement-breakpoint
CREATE TABLE "drug_class_interaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_a" varchar NOT NULL,
	"class_b" varchar NOT NULL,
	"severity" "severity_enum" NOT NULL,
	"mechanism" varchar,
	"management" varchar,
	"sources" jsonb[] DEFAULT '{}' NOT NULL,
	CONSTRAINT "drug_class_interaction_class_a_class_b_unique" UNIQUE("class_a","class_b")
);
--> statement-breakpoint
CREATE TABLE "drug_concept" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rxcui" varchar NOT NULL,
	"name" varchar NOT NULL,
	"drug_class" varchar[] DEFAULT '{}',
	"identifiers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "drug_concept_rxcui_unique" UNIQUE("rxcui")
);
--> statement-breakpoint
CREATE TABLE "drug_interaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drug1_rxcui" varchar NOT NULL,
	"drug2_rxcui" varchar NOT NULL,
	"severity" "severity_enum" NOT NULL,
	"mechanism" varchar,
	"management" varchar,
	"sources" jsonb[] DEFAULT '{}' NOT NULL,
	"class_rule_id" uuid,
	"is_generated" boolean DEFAULT false,
	"confidence" numeric(3, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "drug_interaction_drug1_rxcui_drug2_rxcui_unique" UNIQUE("drug1_rxcui","drug2_rxcui")
);
--> statement-breakpoint
ALTER TABLE "drug_interaction" ADD CONSTRAINT "drug_interaction_drug1_rxcui_drug_concept_rxcui_fk" FOREIGN KEY ("drug1_rxcui") REFERENCES "public"."drug_concept"("rxcui") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drug_interaction" ADD CONSTRAINT "drug_interaction_drug2_rxcui_drug_concept_rxcui_fk" FOREIGN KEY ("drug2_rxcui") REFERENCES "public"."drug_concept"("rxcui") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drug_interaction" ADD CONSTRAINT "drug_interaction_class_rule_id_drug_class_interaction_id_fk" FOREIGN KEY ("class_rule_id") REFERENCES "public"."drug_class_interaction"("id") ON DELETE no action ON UPDATE no action;