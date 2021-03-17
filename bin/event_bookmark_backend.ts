#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { EventBookmarkBackendStack } from '../lib/event_bookmark_backend-stack';

const app = new cdk.App();
new EventBookmarkBackendStack(app, 'EventBookmarkBackendStack');
