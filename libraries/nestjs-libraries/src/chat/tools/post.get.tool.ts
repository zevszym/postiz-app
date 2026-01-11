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
export class PostGetTool implements AgentToolInterface {
  constructor(private _postsService: PostsService) {}
  name = 'postGet';

  run() {
    return createTool({
      id: 'postGet',
      description: `This tool retrieves the full details of a specific post, including all content in a thread (for platforms like X/Twitter, Threads) or comments (for LinkedIn, Facebook). Use the post ID from the postsList tool.`,
      inputSchema: z.object({
        postId: z
          .string()
          .describe('The ID of the post to retrieve (from postsList output)'),
      }),
      outputSchema: z.object({
        output: z.object({
          group: z.string().describe('Group ID for the post thread'),
          publishDate: z.string().describe('Scheduled publish date'),
          state: z.string().describe('Post state: QUEUE, DRAFT, PUBLISHED, ERROR'),
          editable: z.boolean().describe('Whether this post can be edited. False for PUBLISHED/ERROR posts.'),
          integration: z.object({
            id: z.string(),
            name: z.string(),
            platform: z.string(),
            picture: z.string().optional(),
          }),
          settings: z.record(z.any()).describe('Platform-specific settings'),
          posts: z.array(
            z.object({
              id: z.string().describe('Individual post/comment ID'),
              content: z.string().describe('Post content (HTML)'),
              images: z.array(
                z.object({
                  id: z.string(),
                  path: z.string(),
                })
              ).describe('Attached images'),
            })
          ).describe('All posts in the thread/group. First item is main post, rest are comments/thread items.'),
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

          const postData = await this._postsService.getPost(
            organizationId,
            context.postId
          );

          if (!postData || !postData.posts || postData.posts.length === 0) {
            return {
              output: { error: 'Post not found' },
            };
          }

          const firstPost = postData.posts[0];
          const isEditable = firstPost.state === 'QUEUE' || firstPost.state === 'DRAFT';

          return {
            output: {
              group: postData.group,
              publishDate: dayjs(firstPost.publishDate).toISOString(),
              state: firstPost.state,
              editable: isEditable,
              integration: {
                id: postData.integration,
                name: firstPost.integration?.name || '',
                platform: firstPost.integration?.providerIdentifier || '',
                picture: postData.integrationPicture,
              },
              settings: postData.settings || {},
              posts: postData.posts.map((p: any) => ({
                id: p.id,
                content: p.content,
                images: (p.image || []).map((img: any) => ({
                  id: img.id,
                  path: img.path || img.url,
                })),
              })),
            },
          };
        } catch (error: any) {
          return {
            output: { error: `Failed to fetch post: ${error.message || 'Unknown error'}` },
          };
        }
      },
    });
  }
}
