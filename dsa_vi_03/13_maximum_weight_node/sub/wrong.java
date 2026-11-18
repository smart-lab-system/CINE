

// User function Template for Java

class Solution {
    public int maxWeightCell(int[] exits) {
        Map<Integer,Integer>map=new HashMap<>();
        for(int i=0;i<exits.length;i++){
            int x=exits[i];
            if(x!=-1){
                map.put(x,map.getOrDefault(x,0)+1);
            }
        }
        int max=0;
        int vi=0;
        for(Map.Entry<Integer,Integer>entry:map.entrySet()){
            if(entry.getValue()>max){
                max=entry.getValue();
                vi=entry.getKey();
            }
        }
        return vi;
    }
}