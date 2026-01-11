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
export class PostUpdateTool implements AgentToolInterface {
  constructor(private _postsService: PostsService) {}
  name = 'postUpdate';

  run() {
    return createTool({
      id: 'postUpdate',
      description: `This tool allows you to reschedule a post to a different date/time. Use postGet first to retrieve the current post details, then use this tool to update the schedule. For content changes, delete the old post and create a new one with schedulePostTool.`,
      inputSchema: z.object({
        postId: z
          .string()
          .describe('The ID of the post to reschedule (from postsList or postGet output)'),
        newDate: z
          .string()
          .describe('The new publish date/time in ISO format (e.g., 2024-12-25T14:00:00Z). Must be in the future.'),
      }),
      outputSchema: z.object({
        output: z.object({
          success: z.boolean(),
          postId: z.string(),
          newDate: z.string(),
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

          if (!context.postId) {
            return {
              output: { error: 'postId is required' },
            };
          }

          if (!context.newDate) {
            return {
              output: { error: 'newDate is required' },
            };
          }

          // Validate the date
          const newDate = dayjs(context.newDate);
          if (!newDate.isValid()) {
            return {
              output: { error: 'Invalid date format. Please use ISO format (e.g., 2024-12-25T14:00:00Z)' },
            };
          }

          if (newDate.isBefore(dayjs())) {
            return {
              output: { error: 'New date must be in the future' },
            };
          }

          // Change the post date
          const result = await this._postsService.changeDate(
            organizationId,
            context.postId,
            newDate.format('YYYY-MM-DDTHH:mm:ss')
          );

          if (!result) {
            return {
              output: { error: 'Post not found or could not be updated' },
            };
          }

          return {
            output: {
              success: true,
              postId: context.postId,
              newDate: newDate.toISOString(),
              message: `Post successfully rescheduled to ${newDate.format('YYYY-MM-DD HH:mm:ss')} UTC`,
            },
          };
        } catch (error: any) {
          return {
            output: { error: `Failed to update post: ${error.message || 'Unknown error'}` },
          };
        }
      },
    });
  }
}
