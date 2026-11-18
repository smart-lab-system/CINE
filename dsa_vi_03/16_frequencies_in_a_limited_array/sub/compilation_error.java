class Solution {
    public List<Integer> frequencyCount(int[] arr) {
        Map<Integer,Integer> map=new HashMap<>();
        for(int num:arr){
            map.put(num,getOrDefault(num,0)+1);
        }
        int result[]=new int [arr.length];
        for(int i=0;i<arr.length;i++){
            result[i]=map.getOrDefault(i+1,0);
        }
        List<Integer>resultant=new ArrayList<>();
        for(int num:result){
            resultant.add(num);
        }
        return resultant;
    }
}