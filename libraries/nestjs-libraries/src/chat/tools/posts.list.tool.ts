import {
  AgentToolInterface,
} from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import z from 'zod';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import dayjs from 'dayjs';

@Injectable()
export class PostsListTool implements AgentToolInterface {
  constructor(private _postsService: PostsService) {}
  name = 'postsList';

  run() {
    return createTool({
      id: 'postsList',
      description: `This tool lists scheduled, draft, and published posts. Use it to view upcoming posts, check what's scheduled, find posts to edit, or view historical posts.

IMPORTANT for viewing past posts: Set startDate to a date in the past (e.g., "2024-01-01") to see historical/published posts.

Note: Posts in PUBLISHED or ERROR state cannot be edited - they are read-only.`,
      inputSchema: z.object({
        startDate: z
          .string()
          .optional()
          .describe('Start date in ISO format (YYYY-MM-DD). Defaults to today. Set to a past date to view historical posts.'),
        endDate: z
          .string()
          .optional()
          .describe('End date in ISO format (YYYY-MM-DD). Defaults to 30 days from start date.'),
        state: z
          .enum(['all', 'scheduled', 'draft', 'published', 'error'])
          .optional()
          .describe('Filter by post state. Defaults to "all". Use "published" to see past published posts.'),
        integrationId: z
          .string()
          .optional()
          .describe('Filter by specific integration ID.'),
        limit: z
          .number()
          .optional()
          .describe('Maximum number of posts to return. Defaults to 100.'),
      }),
      outputSchema: z.object({
        output: z.array(
          z.object({
            id: z.string().describe('Post ID - use this for editing or deleting'),
            group: z.string().describe('Group ID - posts in same group are related (thread/comments)'),
            content: z.string().describe('Post content (HTML)'),
            publishDate: z.string().describe('Scheduled publish date in ISO format'),
            state: z.string().describe('Post state: QUEUE (scheduled), DRAFT, PUBLISHED, ERROR'),
            editable: z.boolean().describe('Whether this post can be edited. False for PUBLISHED/ERROR posts.'),
            releaseURL: z.string().optional().describe('Published post URL (if published)'),
            integration: z.object({
              id: z.string(),
              name: z.string(),
              platform: z.string(),
              picture: z.string().optional(),
            }).describe('Integration/channel this post is for'),
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

          const startDate = context.startDate || dayjs().format('YYYY-MM-DD');
          const endDate = context.endDate || dayjs(startDate).add(30, 'day').format('YYYY-MM-DD');

          const posts = await this._postsService.getPosts(organizationId, {
            startDate,
            endDate,
            customer: '',
          });

          if (!posts || posts.length === 0) {
            return {
              output: [],
            };
          }

          // Filter by state if specified
          let filteredPosts = posts;
          if (context.state && context.state !== 'all') {
            const stateMap: Record<string, string[]> = {
              scheduled: ['QUEUE'],
              draft: ['DRAFT'],
              published: ['PUBLISHED'],
              error: ['ERROR'],
            };
            const targetStates = stateMap[context.state] || [];
            filteredPosts = posts.filter((p: any) => targetStates.includes(p.state));
          }

          // Filter by integration if specified
          if (context.integrationId) {
            filteredPosts = filteredPosts.filter(
              (p: any) => p.integration?.id === context.integrationId
            );
          }

          // Apply limit
          const limit = context.limit || 100;
          const limitedPosts = filteredPosts.slice(0, limit);

          return {
            output: limitedPosts.map((p: any) => {
              const isEditable = p.state === 'QUEUE' || p.state === 'DRAFT';
              return {
                id: p.id,
                group: p.group,
                content: p.content,
                publishDate: dayjs(p.publishDate).toISOString(),
                state: p.state,
                editable: isEditable,
                releaseURL: p.releaseURL || undefined,
                integration: {
                  id: p.integration?.id,
                  name: p.integration?.name,
                  platform: p.integration?.providerIdentifier,
                  picture: p.integration?.picture,
                },
              };
            }),
          };
        } catch (error: any) {
          return {
            output: { error: `Failed to fetch posts: ${error.message || 'Unknown error'}` },
          };
        }
      },
    });
  }
}
