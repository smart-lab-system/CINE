
class Solution {
    public int findUnique(int k, int[] arr) {
        int res=0;
        Map<Integer, Integer> map=new HashMap<>();
        for(int num:arr){
            map.put(num, map.getOrDefault(num, 0) + 1);
        }
        for(Map.Entry<Integer, Integer> entry : map.entrySet()){
            if(entry.getValue() != k){
                res=entry.getKey();
                break;
            }
        }
        return res;
    }
}