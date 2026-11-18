// User function Template for Java

class Solution {
    public List<Integer> singleNumber(int[] arr) {
        List<Integer> list=new LinkedList<>();
        List<Integer> flist=new LinkedList<>();
        for(int i=0;i<arr.length;i++){
            int x=arr[i];
            list.add(x);
            
        }
        for(int i=0;i<list.size();i++){
            int x=list.get(i);
            int fre=Collections.frequency(list,x);
            if(fre==1){
                flist.add(x);
            }
        }
        Collections.sort(flist);
        return flist;
        // Code here
    }
}