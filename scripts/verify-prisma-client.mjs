import { Prisma } from '@prisma/client';

const models = Prisma.dmmf?.datamodel?.models ?? [];
const hasField = (modelName, fieldName) => models.some((model) =>
  model.name === modelName && model.fields.some((field) => field.name === fieldName));

if (typeof Prisma.sql !== 'function' ||
    !hasField('Room', 'marketplaceAmenities') ||
    !hasField('Account', 'cloudyFeedbackOptInAt')) {
  console.error('PRISMA_CLIENT_STALE: generate the client from the integrated V1.18 Prisma schema.');
  process.exitCode = 1;
} else {
  console.log('Prisma Client V1.18 mapping OK.');
}
