import {EventBridgeEvent, Context} from 'aws-lambda';
import {randomBytes} from 'crypto'
import * as AWS from 'aws-sdk';
const dynamoClient = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event: EventBridgeEvent<string, any>, conntext: Context) => {

    try{

        if(event["detail-type"] === "addBookmark"){
            const params = {
                TableName: process.env.ADDBOOKMARK_EVENT || "" ,
                Item: {
                    id: randomBytes(16).toString("hex"),
                    title: event.detail.title,
                    bookmark: event.detail.bookmark,
                },
            };
            await dynamoClient.put(params).promise()
    
        }
    
        else if(event["detail-type"] === "deleteBookmark"){
            const params = {
                TableName: process.env.ADDBOOKMARK_EVENT || "" ,
                Key: {
                    id: event.detail.id
                },
            };
            await dynamoClient.delete(params).promise()
    
        }

    }
    catch(err){
        console.log("Error", err)
    }

}