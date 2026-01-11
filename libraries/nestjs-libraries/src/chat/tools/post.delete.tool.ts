import {
  AgentToolInterface,
} from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import z from 'zod';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';

@Injectable()
export class PostDeleteTool implements AgentToolInterface {
  constructor(private _postsService: PostsService) {}
  name = 'postDelete';

  run() {
    return createTool({
      id: 'postDelete',
      description: `This tool deletes a scheduled or draft post. This action cannot be undone. Use the group ID from postsList or postGet to delete an entire post group (including all comments/thread items).`,
      inputSchema: z.object({
        groupId: z
          .string()
          .describe('The group ID of the post to delete (from postsList or postGet output). This will delete the entire post thread including all comments.'),
      }),
      outputSchema: z.object({
        output: z.object({
          success: z.boolean(),
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

          if (!context.groupId) {
            return {
              output: { error: 'groupId is required' },
            };
          }

          await this._postsService.deletePost(organizationId, context.groupId);

          return {
            output: {
              success: true,
              message: `Post group "${context.groupId}" has been deleted successfully.`,
            },
          };
        } catch (error: any) {
          return {
            output: { error: `Failed to delete post: ${error.message || 'Unknown error'}` },
          };
        }
      },
    });
  }
}
