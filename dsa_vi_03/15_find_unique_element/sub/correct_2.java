
class Solution {
    public int findUnique(int k, int[] arr) {
        int n=arr.length;
        Map<Integer,Integer> mpp=new HashMap<>();
       for(int num:arr){
           mpp.put(num,mpp.getOrDefault(num,0)+1);
       }
       for(Map.Entry<Integer,Integer>entry:mpp.entrySet()){
           if(entry.getValue()%k!=0){
               return entry.getKey();
           }
       }
       return -1;
    }
    
}