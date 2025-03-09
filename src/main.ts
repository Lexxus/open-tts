import fs from 'node:fs';
import path from 'node:path';
import process from "node:process";
import { Buffer } from "node:buffer";
import parseArgs, { ParsedArgs } from 'minimist';
import OpenAI from 'openai';
import type { SpeechCreateParams } from 'openai/resources/audio';
import 'dotenv/config';

type Voice = SpeechCreateParams['voice'];
type ResponceFormat = SpeechCreateParams['response_format'];

interface IOptions {
  voice: Voice;
  format: ResponceFormat;
}

const DEFAULT_FILE_OUTPUT = './output';
const DEFAULT_VOICE: Voice = 'onyx';
const DEFAULT_FORMAT: ResponceFormat = 'mp3';

function printHelp() {
  console.log('tts-convert: Convert text into voice');
  console.log('\nUsage: tts-convert <inputFile.txt> <outputFile.mp3> [OPTIONS]');
  console.log('\nExample:');
  console.log('    tts-convert book.txt audio-book.aac');
  console.log('    tts-convert book.txt audio-book --voice echo -f opus');
  console.log('\nOptions:');
  console.log("    --voice       male: 'ash' | 'echo' | 'onyx' | 'nova'");
  console.log("                  female: 'alloy' | 'coral' | 'fable' | 'nova' | 'sage' | 'shimmer'");
  console.log("                  default = '%s'", DEFAULT_VOICE);
  console.log("    --format, -f  'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm'");
  console.log("                  default = '$s'", DEFAULT_FORMAT);
}

function getOpenAI() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
}

function isValidVoice(voice: string): voice is Voice {
  return ['alloy', 'ash', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer'].includes(voice);
}

function isValidFormat(format: string): format is ResponceFormat {
  return ['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm'].includes(format);
}

export function getFormat(argv: ParsedArgs): ResponceFormat {
  let format: string | undefined = argv.format || argv.f;

  if (format && !isValidFormat(format)) {
    console.warn(`Unsupported format option '${format}'`);
  }

  if (!format || !isValidFormat(format)) {
    const [_, paramOutput = DEFAULT_FILE_OUTPUT] = argv._;
    const fileChunks = paramOutput.split('.');
    const ext = fileChunks.at(-1)?.toLowerCase();

    format = fileChunks.length > 1 && (fileChunks[0] || fileChunks.length > 2) && isValidFormat(ext!) ? ext! : DEFAULT_FORMAT;
  }

  return format;
}

export function getVoice(argv: ParsedArgs): Voice {
  if (!argv.voice) return DEFAULT_VOICE;
  const isValid = isValidVoice(argv.voice);

  if (!isValid) {
    console.warn(`Unknown voice option '${argv.voice}'. Using default voice '${DEFAULT_VOICE}'`);
  }
  return isValid ? argv.voice : DEFAULT_VOICE;
}

export function getFileOutput(paramOutput: string, format: ResponceFormat): string {
  const ext = `.${format}`;
  const isFormatIncludes = paramOutput.toLowerCase().endsWith(ext);
  const fileName = isFormatIncludes ? paramOutput.split('.').slice(0, -1).join('.') : paramOutput;
  let fileOutput = fileName + ext;
  let i = 0;

  while (fs.existsSync(fileOutput)) {
    fileOutput = `${fileName}-${++i}${ext}`;
  }

  return fileOutput;
}

export function getParams(args: string[]): [string, string, IOptions] | null {
  const argv = parseArgs(args);
  const [fileInput, paramOutput = DEFAULT_FILE_OUTPUT] = argv._;

  if (!fileInput) {
    printHelp();

    return null;
  }
  const format = getFormat(argv);
  const voice = getVoice(argv);
  const fileOutput = getFileOutput(paramOutput, format);
  const options: IOptions = { voice, format };

  return [fileInput, fileOutput, options];
}

async function convert(inputFile: string, outputFile: string, options: IOptions) {
  const fileInput = path.resolve(inputFile);

  if (!fs.existsSync(fileInput)) {
    throw Error(`File "${fileInput}" not found`);
  }
  const { voice, format } = options;
  const text = await fs.promises.readFile(fileInput, 'utf-8');

  if (!text) {
    throw Error(`File "${fileInput}" is empty`);
  }

  console.log('Creating "%s" voice for the text length %d characters...', voice, text.length);
  console.time('tts');
  const openai = getOpenAI();
  const mp3 = await openai.audio.speech.create({
    model: 'tts-1',
    voice,
    response_format: format,
    input: text
  });
  console.timeEnd('tts');
  const fileOutput = path.resolve(outputFile);

  const buffer = Buffer.from(await mp3.arrayBuffer());
  await fs.promises.writeFile(fileOutput, buffer);
  console.log('Saved into a file "%s"', fileOutput);
}

let isModule = false;

if (typeof require === 'undefined') {
  isModule = import.meta.url !== Deno.mainModule;
} else {
  isModule = require.main !== module;
}

if (!isModule) {
  const params = getParams(process.argv.slice(2));

  if (!params) process.exit(1);
  const [input, output, options] = params;

  await convert(input, output, options);

  console.log('Done.');

  process.exit(0);
}
