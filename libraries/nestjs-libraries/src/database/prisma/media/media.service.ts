import { HttpException, Injectable } from '@nestjs/common';
import { MediaRepository } from '@gitroom/nestjs-libraries/database/prisma/media/media.repository';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { Organization } from '@prisma/client';
import { SaveMediaInformationDto } from '@gitroom/nestjs-libraries/dtos/media/save.media.information.dto';
import { VideoManager } from '@gitroom/nestjs-libraries/videos/video.manager';
import { VideoDto } from '@gitroom/nestjs-libraries/dtos/videos/video.dto';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import {
  AuthorizationActions,
  Sections,
  SubscriptionException,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';

@Injectable()
export class MediaService {
  private storage = UploadFactory.createStorage();

  constructor(
    private _mediaRepository: MediaRepository,
    private _openAi: OpenaiService,
    private _subscriptionService: SubscriptionService,
    private _videoManager: VideoManager
  ) {}

  async deleteMedia(org: string, id: string) {
    return this._mediaRepository.deleteMedia(org, id);
  }

  getMediaById(id: string) {
    return this._mediaRepository.getMediaById(id);
  }

  async generateImage(
    prompt: string,
    org: Organization,
    generatePromptFirst?: boolean,
    provider?: string,
    aspectRatio?: string,
    geminiOptions?: {
      model?: string;
      thinkingLevel?: string;
      useGoogleSearch?: boolean;
      useImageSearch?: boolean;
      referenceImageUrls?: string[];
    }
  ) {
    const generating = await this._subscriptionService.useCredit(
      org,
      'ai_images',
      async () => {
        if (generatePromptFirst) {
          prompt = await this._openAi.generatePromptForPicture(prompt);
          console.log('Prompt:', prompt);
        }

        const useProvider = (provider || process.env.IMAGE_GENERATION_PROVIDER || 'dalle').toLowerCase();
        if (useProvider === 'gemini') {
          // Fetch reference images if provided
          let referenceImages: Array<{ mimeType: string; data: string }> | undefined;
          if (geminiOptions?.referenceImageUrls?.length) {
            referenceImages = await Promise.all(
              geminiOptions.referenceImageUrls.map((url) =>
                this._openAi.fetchImageAsBase64(url)
              )
            );
          }

          const result = await this._openAi.generateImageGemini(prompt, {
            aspectRatio,
            model: geminiOptions?.model,
            thinkingLevel: geminiOptions?.thinkingLevel,
            useGoogleSearch: geminiOptions?.useGoogleSearch,
            useImageSearch: geminiOptions?.useImageSearch,
            referenceImages,
          });
          return result.imageBase64;
        }

        return this._openAi.generateImage(prompt, !!generatePromptFirst);
      }
    );

    return generating;
  }

  async editImage(
    instruction: string,
    sourceImageUrl: string,
    org: Organization,
    options?: {
      aspectRatio?: string;
      model?: string;
      thinkingLevel?: string;
    }
  ) {
    return this._subscriptionService.useCredit(
      org,
      'ai_images',
      async () => {
        const sourceImage = await this._openAi.fetchImageAsBase64(sourceImageUrl);
        const result = await this._openAi.editImageGemini(
          instruction,
          sourceImage.data,
          sourceImage.mimeType,
          options
        );
        return result.imageBase64;
      }
    );
  }

  saveFile(org: string, fileName: string, filePath: string, originalName?: string) {
    return this._mediaRepository.saveFile(org, fileName, filePath, originalName);
  }

  getMedia(org: string, page: number) {
    return this._mediaRepository.getMedia(org, page);
  }

  saveMediaInformation(org: string, data: SaveMediaInformationDto) {
    return this._mediaRepository.saveMediaInformation(org, data);
  }

  getVideoOptions() {
    return this._videoManager.getAllVideos();
  }

  async generateVideoAllowed(org: Organization, type: string) {
    const video = this._videoManager.getVideoByName(type);
    if (!video) {
      throw new Error(`Video type ${type} not found`);
    }

    if (!video.trial && org.isTrailing) {
      throw new HttpException('This video is not available in trial mode', 406);
    }

    return true;
  }

  async generateVideo(org: Organization, body: VideoDto) {
    const totalCredits = await this._subscriptionService.checkCredits(
      org,
      'ai_videos'
    );

    if (totalCredits.credits <= 0) {
      throw new SubscriptionException({
        action: AuthorizationActions.Create,
        section: Sections.VIDEOS_PER_MONTH,
      });
    }

    const video = this._videoManager.getVideoByName(body.type);
    if (!video) {
      throw new Error(`Video type ${body.type} not found`);
    }

    if (!video.trial && org.isTrailing) {
      throw new HttpException('This video is not available in trial mode', 406);
    }

    console.log(body.customParams);
    await video.instance.processAndValidate(body.customParams);
    console.log('no err');

    return await this._subscriptionService.useCredit(
      org,
      'ai_videos',
      async () => {
        const loadedData = await video.instance.process(
          body.output,
          body.customParams
        );

        const file = await this.storage.uploadSimple(loadedData);
        return this.saveFile(org.id, file.split('/').pop(), file);
      }
    );
  }

  async videoFunction(identifier: string, functionName: string, body: any) {
    const video = this._videoManager.getVideoByName(identifier);
    if (!video) {
      throw new Error(`Video with identifier ${identifier} not found`);
    }

    // @ts-ignore
    const functionToCall = video.instance[functionName];
    if (
      typeof functionToCall !== 'function' ||
      this._videoManager.checkAvailableVideoFunction(functionToCall)
    ) {
      throw new HttpException(
        `Function ${functionName} not found on video instance`,
        400
      );
    }

    return functionToCall(body);
  }
}
