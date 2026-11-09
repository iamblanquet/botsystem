import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const companies = sqliteTable('companies', {
  id: text('id').primaryKey(), owner: text('owner').notNull(), name: text('name').notNull(),
  website: text('website').notNull(), description: text('description').notNull().default(''),
  budget: integer('budget').notNull().default(25000000), status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
});
export const assistants = sqliteTable('assistants', {
  id: text('id').primaryKey(), companyId: text('company_id').notNull().references(() => companies.id),
  name: text('name').notNull(), subtitle: text('subtitle').notNull(), color: text('color').notNull(),
  welcome: text('welcome').notNull(), instructions: text('instructions').notNull(),
  suggestions: text('suggestions').notNull(), model: text('model').notNull().default('gemini-3.8-flash'),
  mode: text('mode').notNull().default('demo'), published: integer('published').notNull().default(0),
  origins: text('origins').notNull(), catalogUrl: text('catalog_url').notNull().default(''),
  createdAt: text('created_at').notNull(),
});
export const providers = sqliteTable('providers', {
  companyId: text('company_id').primaryKey().references(() => companies.id),
  encryptedKey: text('encrypted_key'), inputPrice: integer('input_price').notNull().default(0),
  outputPrice: integer('output_price').notNull().default(0), updatedAt: text('updated_at').notNull(),
});
export const sources = sqliteTable('sources', {
  id: text('id').primaryKey(), companyId: text('company_id').notNull().references(() => companies.id),
  assistantId: text('assistant_id').notNull().references(() => assistants.id),
  name: text('name').notNull(), type: text('type').notNull(), content: text('content').notNull(),
  storageKey: text('storage_key'), bytes: integer('bytes').notNull().default(0),
  createdAt: text('created_at').notNull(),
});
export const balances = sqliteTable('balances', {
  id: text('id').primaryKey(), companyId: text('company_id').notNull().references(() => companies.id),
  month: text('month').notNull(), spent: integer('spent').notNull().default(0),
  reserved: integer('reserved').notNull().default(0),
}, (t) => [uniqueIndex('balance_company_month').on(t.companyId, t.month)]);
export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(), assistantId: text('assistant_id').notNull().references(() => assistants.id),
  companyId: text('company_id').notNull().references(() => companies.id),
  mode: text('mode').notNull(), title: text('title').notNull(), createdAt: text('created_at').notNull(),
});
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(), conversationId: text('conversation_id').notNull().references(() => conversations.id),
  role: text('role').notNull(), content: text('content').notNull(), createdAt: text('created_at').notNull(),
});
export const usage = sqliteTable('usage', {
  id: text('id').primaryKey(), companyId: text('company_id').notNull().references(() => companies.id),
  assistantId: text('assistant_id').notNull().references(() => assistants.id),
  conversationId: text('conversation_id').notNull(), model: text('model').notNull(), mode: text('mode').notNull(),
  inputTokens: integer('input_tokens').notNull().default(0), outputTokens: integer('output_tokens').notNull().default(0),
  cost: integer('cost').notNull().default(0), reservation: integer('reservation').notNull().default(0),
  status: text('status').notNull(), requestKey: text('request_key').notNull().unique(), createdAt: text('created_at').notNull(),
});
export const limits = sqliteTable('rate_limits', {
  id: text('id').primaryKey(), count: integer('count').notNull().default(0), expires: integer('expires').notNull(),
});
