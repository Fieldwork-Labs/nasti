-- Migration: Add contact fields to organisation table
-- Generated: $(date)

ALTER TABLE "public"."organisation" 
ADD COLUMN "contact_name" "text",
ADD COLUMN "contact_email" "text",
ADD COLUMN "contact_phone" "text",
ADD COLUMN "contact_address" "text";