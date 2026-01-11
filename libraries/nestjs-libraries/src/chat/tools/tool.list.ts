import { IntegrationValidationTool } from '@gitroom/nestjs-libraries/chat/tools/integration.validation.tool';
import { IntegrationTriggerTool } from '@gitroom/nestjs-libraries/chat/tools/integration.trigger.tool';
import { IntegrationSchedulePostTool } from './integration.schedule.post';
import { GenerateVideoOptionsTool } from '@gitroom/nestjs-libraries/chat/tools/generate.video.options.tool';
import { VideoFunctionTool } from '@gitroom/nestjs-libraries/chat/tools/video.function.tool';
import { GenerateVideoTool } from '@gitroom/nestjs-libraries/chat/tools/generate.video.tool';
import { GenerateImageTool } from '@gitroom/nestjs-libraries/chat/tools/generate.image.tool';
import { IntegrationListTool } from '@gitroom/nestjs-libraries/chat/tools/integration.list.tool';
import { PostsListTool } from '@gitroom/nestjs-libraries/chat/tools/posts.list.tool';
import { PostGetTool } from '@gitroom/nestjs-libraries/chat/tools/post.get.tool';
import { PostUpdateTool } from '@gitroom/nestjs-libraries/chat/tools/post.update.tool';
import { PostEditTool } from '@gitroom/nestjs-libraries/chat/tools/post.edit.tool';
import { PostDeleteTool } from '@gitroom/nestjs-libraries/chat/tools/post.delete.tool';

export const toolList = [
  IntegrationListTool,
  IntegrationValidationTool,
  IntegrationTriggerTool,
  IntegrationSchedulePostTool,
  PostsListTool,
  PostGetTool,
  PostUpdateTool,
  PostEditTool,
  PostDeleteTool,
  GenerateVideoOptionsTool,
  VideoFunctionTool,
  GenerateVideoTool,
  GenerateImageTool,
];
