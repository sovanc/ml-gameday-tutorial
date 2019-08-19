#! /usr/bin/env node
var aws=require('./aws')
var sns=new aws.SNS()
var cloudformation=new aws.CloudFormation()
var step=new aws.StepFunctions()
var args=require('args')
var ssm=new aws.SSM()
var config=require('../config')
var GetOutput=require('./output').run
var deploy=require('../deploy-config')
args.option('pipeline',"layout or shoot, which pipeline to start")
    .example("startPipline --pipeline Layout","starts the Layout pipeline")
const flags=args.parse(process.argv)
var pipeline=flags.pipeline==="shoot" ? "ShootLaunchTopic" : "LayoutLaunchTopic"
var paramstore=flags.pipeline==="shoot" ? "ShootParams" : "LayoutParams"
var statemachine=flags.pipeline==="shoot" ? "ShootStateMachine" : "LayoutStateMachine"

GetOutput().then(async output=>{
    console.log("Updating Parameter store")
    var params=JSON.parse((await ssm.getParameter({
        Name:output[paramstore]
    }).promise()).Parameter.Value)
    Object.assign(params, deploy[flags.pipeline])

    await ssm.putParameter({
        Name:output[paramstore],
        Type:"String",
        Value:JSON.stringify(params),
        Overwrite:true
    }).promise()

    console.log("Starting pipeline")
    var result=await sns.publish({
        Message:"{}",
        TopicArn:output[pipeline]   
    }).promise()
    console.log("pipeline started succesfully")
    return output
})
.then(async output=>{
    count=0
    return new Promise(async (res,rej)=>{
        setTimeout(x=>next(),5000)
        async function next(){
            var executions=await step.listExecutions({
                stateMachineArn:output[statemachine],
                statusFilter:"RUNNING"
            }).promise()

            if(executions.executions.length>0){
                count++
                process.stdout.write(count%20===0 ? '\n' : '.')
                setTimeout(x=>next(),5000)
            }else{
                console.log('finished: check execution for status')
                res()
            }
        }
    })
})
.catch(e=>{
    console.log("SageBuild pipeline failed")
    console.log(e)
})
