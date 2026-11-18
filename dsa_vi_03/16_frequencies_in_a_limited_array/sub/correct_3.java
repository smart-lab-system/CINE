

class Solution {
    // Function to count the frequency of all elements from 1 to N in the array.
    public List<Integer> frequencyCount(int[] arr) {
        HashMap<Integer,Integer> map=new HashMap<>();
        List<Integer> list=new ArrayList<>();
        for(int i=0;i<arr.length;i++){
            map.put(arr[i],map.getOrDefault(arr[i],0)+1);
        }
        for(int i=1;i<=arr.length;i++){
            if(map.containsKey(i)){
                list.add(map.get(i));
            }
            else{list.add(0);
        }
        }
        return list;
    }
}