const {randomUUID}=require('crypto');
const {store,saveStore}=require('../config/store');

function authorized(req){
  const key=process.env.ADMIN_API_KEY;
  return !!key && req.get('x-admin-key')===key;
}
function guard(req,res){
  if(!authorized(req)){res.status(401).json({success:false,message:'Admin authorization required.'});return false;}
  return true;
}
function createOrganization(req,res){
  if(!guard(req,res))return;
  const {name,description,icon='🌿',website='',location='',type='Organization'}=req.body||{};
  if(!name||!description)return res.status(400).json({success:false,message:'name and description are required'});
  const org={_id:randomUUID(),name:String(name).trim(),description:String(description).trim(),icon,website,location,type,members:0,impact:{},verified:true,createdAt:new Date()};
  store.organizations.push(org);saveStore();res.status(201).json({success:true,data:org});
}
function createReward(req,res){
  if(!guard(req,res))return;
  const {title,description,cost,icon='🎁',partnerName='',partnerWebsite='',terms='',expiresAt=null}=req.body||{};
  if(!title||!description||cost===undefined||!partnerName)return res.status(400).json({success:false,message:'title, description, cost and partnerName are required'});
  const numericCost=Number(cost);
  if(!Number.isFinite(numericCost)||numericCost<1)return res.status(400).json({success:false,message:'cost must be a positive number'});
  const reward={_id:randomUUID(),title:String(title).trim(),description:String(description).trim(),cost:numericCost,icon,partnerName,partnerWebsite,terms,expiresAt,verified:true,createdAt:new Date()};
  store.rewards.push(reward);saveStore();res.status(201).json({success:true,data:reward});
}
function deleteOrganization(req,res){
  if(!guard(req,res))return;
  const before=store.organizations.length;store.organizations=store.organizations.filter(x=>x._id!==req.params.id);
  if(store.organizations.length===before)return res.status(404).json({success:false,message:'Organization not found'});
  saveStore();res.json({success:true,message:'Organization removed'});
}
function deleteReward(req,res){
  if(!guard(req,res))return;
  const before=store.rewards.length;store.rewards=store.rewards.filter(x=>x._id!==req.params.id);
  if(store.rewards.length===before)return res.status(404).json({success:false,message:'Reward not found'});
  saveStore();res.json({success:true,message:'Reward removed'});
}
module.exports={createOrganization,createReward,deleteOrganization,deleteReward};
