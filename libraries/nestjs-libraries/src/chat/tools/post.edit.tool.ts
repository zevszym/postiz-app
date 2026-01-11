import {
  AgentToolInterface,
} from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import z from 'zod';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import dayjs from 'dayjs';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';

@Injectable()
export class PostEditTool implements AgentToolInterface {
  constructor(
    private _postsService: PostsService,
    private _integrationService: IntegrationService
  ) {}
  name = 'postEdit';

  run() {
    return createTool({
      id: 'postEdit',
      description: `This tool allows you to edit the content, images, and settings of an existing scheduled or draft post.

IMPORTANT: First use postGet to retrieve the current post details, then use this tool to make changes.
You must provide the group ID and all posts in the thread (not just the ones you want to change).

For adding images:
- Use image URLs (either from generateImageTool or external URLs)
- Each image needs an id (use a random string like "img1") and path (the URL)

For thread/comment structure:
- First item in postsAndComments is the main post
- Additional items are comments (LinkedIn/Facebook) or thread items (X/Threads/Bluesky)`,
      inputSchema: z.object({
        groupId: z
          .string()
          .describe('The group ID of the post to edit (from postGet output)'),
        integrationId: z
          .string()
          .describe('The integration ID (from postGet output)'),
        date: z
          .string()
          .optional()
          .describe('New publish date in ISO format. If not provided, keeps the original date.'),
        postsAndComments: z
          .array(
            z.object({
              id: z
                .string()
                .optional()
                .describe('The existing post ID (from postGet). Leave empty for new thread items.'),
              content: z
                .string()
                .describe('The content of the post/comment in HTML format. Each line must be wrapped in <p>. Allowed tags: h1, h2, h3, u, strong, li, ul, p'),
              images: z
                .array(
                  z.object({
                    id: z.string().describe('Image ID (can be any unique string for new images)'),
                    path: z.string().describe('Image URL'),
                  })
                )
                .optional()
                .describe('Images to attach to this post/comment'),
            })
          )
          .describe('All posts in the thread. First item is the main post, rest are comments/thread items.'),
        settings: z
          .array(
            z.object({
              key: z.string().describe('Setting key name'),
              value: z.any().describe('Setting value'),
            })
          )
          .optional()
          .describe('Platform-specific settings (from integrationSchema tool)'),
      }),
      outputSchema: z.object({
        output: z.object({
          success: z.boolean(),
          postId: z.string(),
          message: z.string(),
        }).or(z.object({
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

          // Validate required fields
          if (!context.groupId) {
            return {
              output: { error: 'groupId is required. Use postGet first to get the group ID.' },
            };
          }

          if (!context.integrationId) {
            return {
              output: { error: 'integrationId is required. Use postGet first to get the integration ID.' },
            };
          }

          if (!context.postsAndComments || context.postsAndComments.length === 0) {
            return {
              output: { error: 'postsAndComments is required and must have at least one item.' },
            };
          }

          // Get the original post to preserve date if not provided
          const originalPost = await this._postsService.getPostsByGroup(
            organizationId,
            context.groupId
          );

          if (!originalPost || !originalPost.posts || originalPost.posts.length === 0) {
            return {
              output: { error: 'Original post not found. The group ID may be invalid.' },
            };
          }

          // Get integration details
          const integration = await this._integrationService.getIntegrationById(
            organizationId,
            context.integrationId
          );

          if (!integration) {
            return {
              output: { error: 'Integration not found.' },
            };
          }

          // Determine the date
          const publishDate = context.date
            ? dayjs(context.date).format('YYYY-MM-DDTHH:mm:ss')
            : dayjs(originalPost.posts[0].publishDate).format('YYYY-MM-DDTHH:mm:ss');

          // Build settings
          const settings = (context.settings || []).reduce(
            (acc: Record<string, any>, s: { key: string; value: any }) => ({
              ...acc,
              [s.key]: s.value,
            }),
            {} as Record<string, any>
          );

          // Create the update payload
          const updatePayload = {
            type: 'schedule' as const,
            date: publishDate,
            shortLink: false,
            tags: [],
            posts: [
              {
                integration: { id: context.integrationId },
                group: context.groupId,
                settings: {
                  ...settings,
                  __type: integration.providerIdentifier,
                },
                value: context.postsAndComments.map((p: any) => ({
                  id: p.id || makeId(10),
                  content: p.content,
                  image: (p.images || []).map((img: any) => ({
                    id: img.id || makeId(10),
                    path: img.path,
                  })),
                })),
              },
            ],
          };

          // Map and validate the payload
          const mappedPayload = await this._postsService.mapTypeToPost(
            updatePayload,
            organizationId,
            true // replaceDraft - converts draft to schedule if needed
          );

          // Create/update the post
          const result = await this._postsService.createPost(organizationId, mappedPayload);

          if (!result || result.length === 0) {
            return {
              output: { error: 'Failed to update post.' },
            };
          }

          return {
            output: {
              success: true,
              postId: result[0].postId,
              message: `Post successfully updated. New post ID: ${result[0].postId}`,
            },
          };
        } catch (error: any) {
          return {
            output: { error: `Failed to edit post: ${error.message || 'Unknown error'}` },
          };
        }
      },
    });
  }
}
