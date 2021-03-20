import * as cdk from '@aws-cdk/core';
import * as lambda from "@aws-cdk/aws-lambda";
import * as events from "@aws-cdk/aws-events";
import * as appsync from "@aws-cdk/aws-appsync";
import * as targets from "@aws-cdk/aws-events-targets";
import * as dynamodb from "@aws-cdk/aws-dynamodb";
import * as cognito from "@aws-cdk/aws-cognito";
import { requestTemplate, responseTemplate } from '../utils/appsync-request-response';

export class EventBookmarkBackendStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here

    const userPool = new cognito.UserPool(this, "googleUserPool", {
      selfSignUpEnabled: true,
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      userVerification: {
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },

      autoVerify: {
        email: true,
      },

      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
      },

    });

    const provider = new cognito.UserPoolIdentityProviderGoogle(this, "googleProviderforPool", {
      userPool: userPool,
      clientId: "833003558670-5a1etobbb66dfa8ogisp9p077otohg3o.apps.googleusercontent.com",
      clientSecret: "boOPQxEGcfgr3jJemdfk2yNF",
      attributeMapping: {
        email: cognito.ProviderAttribute.GOOGLE_EMAIL,
        givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
        phoneNumber: cognito.ProviderAttribute.GOOGLE_PHONE_NUMBERS,
      },
      scopes: ["profile", "email", "openid"],
    });

    userPool.registerIdentityProvider(provider);

    const userPoolClient = new cognito.UserPoolClient(this, "myAmplifyClient", {
      userPool,
      oAuth: {
        callbackUrls: ["https://dr8spiw3c54hi.cloudfront.net/"], // This is what user is allowed to be redirected to with the code upon signin. this can be a list of urls.
        logoutUrls: ["https://dr8spiw3c54hi.cloudfront.net/"]
      },
    });

    const domain = userPool.addDomain("domain", {
      cognitoDomain: {
        domainPrefix: "bookmark-by-mutahir", // SET YOUR OWN Domain PREFIX HERE
      },
    });

    new cdk.CfnOutput(this, "aws_user_pools_web_client_id", {
      value: userPoolClient.userPoolClientId,
    });
    new cdk.CfnOutput(this, "aws_project_region", {
      value: this.region,
    });
    new cdk.CfnOutput(this, "aws_user_pools_id", {
      value: userPool.userPoolId,
    });

    new cdk.CfnOutput(this, "domain", {
      value: domain.domainName,
    });


    const api = new appsync.GraphqlApi(this, "BookmarkApi", {
      name: "BookmarkEventApi",
      schema: appsync.Schema.fromAsset('graphql/schema.graphql'),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.API_KEY,

        },
      },
      logConfig: { fieldLogLevel: appsync.FieldLogLevel.ALL },
      xrayEnabled: true,
    });

    // Http Datasource
    const httpDs = api.addHttpDataSource(
      "ds",
      "https://events." + this.region + ".amazonaws.com/", // This is the ENDPOINT for eventbridge.
      {
        name: "httpDsEventBridgeBookmark",
        description: "Appsync To Event Bridge",
        authorizationConfig: {
          signingRegion: this.region,
          signingServiceName: "events",
        },
      }
    );

    events.EventBus.grantAllPutEvents(httpDs);

    const bookmarkLambda = new lambda.Function(this, "bookmarkLambda", {
      code: lambda.Code.fromAsset("function"),
      runtime: lambda.Runtime.NODEJS_12_X,
      handler: "index.handler"
    });

    const mutations = ["addBookmark", "deleteBookmark"]

    mutations.forEach((mut) => {

      if (mut === "addBookmark") {
        let details = `\\\"title\\\": \\\"$ctx.arguments.title\\\",\\\"bookmark\\\": \\\"$ctx.arguments.bookmark\\\"`

        const addTodoResolver = httpDs.createResolver({
          typeName: "Mutation",
          fieldName: "addBookmark",
          requestMappingTemplate: appsync.MappingTemplate.fromString(requestTemplate(details, mut)),
          responseMappingTemplate: appsync.MappingTemplate.fromString(responseTemplate()),
        });
      }

      else if (mut === "deleteBookmark") {
        let details = `\\\"id\\\": \\\"$ctx.arguments.id\\\"`

        const deleteResolver = httpDs.createResolver({
          typeName: "Mutation",
          fieldName: "deleteBookmark",
          requestMappingTemplate: appsync.MappingTemplate.fromString(requestTemplate(details, mut)),
          responseMappingTemplate: appsync.MappingTemplate.fromString(responseTemplate()),
        });
      }

    });

    // Dynamodb Table
    const dynamodbTable = new dynamodb.Table(this, "EventBookmarkTable", {
      tableName: "addBookmarkEvent",
      partitionKey: {
        name: "id",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST
    });

    dynamodbTable.grantFullAccess(bookmarkLambda);
    bookmarkLambda.addEnvironment('ADDBOOKMARK_EVENT', dynamodbTable.tableName);

    const datasource = api.addDynamoDbDataSource('appsyncDatasource', dynamodbTable)

    datasource.createResolver({
      typeName: "Query",
      fieldName: "getBookmarks",
      requestMappingTemplate: appsync.MappingTemplate.dynamoDbScanTable(),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultList()
    });

    // RULE ON DEFAULT EVENT BUS TO TARGET todoLambda LAMBDA
    const rule = new events.Rule(this, "BookmarkEventRule", {
      eventPattern: {
        source: ["eru-bookmark-events"],
        detailType: [...mutations]
      },
    });

    rule.addTarget(new targets.LambdaFunction(bookmarkLambda))

  }
}
