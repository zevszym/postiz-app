import {
  AgentToolInterface,
  ToolReturn,
} from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import z from 'zod';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';

@Injectable()
export class IntegrationListTool implements AgentToolInterface {
  constructor(private _integrationService: IntegrationService) {}
  name = 'integrationList';

  run() {
    return createTool({
      id: 'integrationList',
      description: `This tool lists all available integrations/channels to schedule posts to. Returns the integration ID, name, platform, and status information. Use the 'id' field when scheduling posts. Integrations marked as disabled or refreshNeeded cannot be used until re-enabled or reconnected.`,
      outputSchema: z.object({
        output: z.array(
          z.object({
            id: z.string().describe('The integration ID to use when scheduling posts'),
            name: z.string().describe('Display name of the channel/account'),
            picture: z.string().describe('Profile picture URL'),
            platform: z.string().describe('Platform identifier (e.g., facebook, instagram, x, linkedin)'),
            profile: z.string().optional().describe('Username or profile identifier'),
            type: z.string().describe('Integration type: social or article'),
            disabled: z.boolean().describe('If true, integration is disabled and cannot be used'),
            refreshNeeded: z.boolean().describe('If true, integration needs to be reconnected'),
            available: z.boolean().describe('If true, integration can be used for posting'),
          })
        ).or(z.object({
          error: z.string(),
        })),
      }),
      execute: async (args, options) => {
        try {
          const { context, runtimeContext } = args;
          checkAuth(args, options);

          const orgString = runtimeContext.get('organization') as string;
          if (!orgString) {
            return {
              output: { error: 'Not authenticated. Please provide a valid API key.' },
            };
          }

          const organizationId = JSON.parse(orgString).id;

          const integrations = await this._integrationService.getIntegrationsList(organizationId);

          if (!integrations || integrations.length === 0) {
            return {
              output: [],
            };
          }

          return {
            output: integrations.map((p) => ({
              id: p.id,
              name: p.name,
              picture: p.picture || '/no-picture.jpg',
              platform: p.providerIdentifier,
              profile: p.profile || undefined,
              type: p.type,
              disabled: p.disabled,
              refreshNeeded: p.refreshNeeded,
              available: !p.disabled && !p.refreshNeeded && !p.inBetweenSteps,
            })),
          };
        } catch (error: any) {
          return {
            output: { error: `Failed to fetch integrations: ${error.message || 'Unknown error'}` },
          };
        }
      },
    });
  }
}
